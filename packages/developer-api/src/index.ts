import "./bootstrap-env.js";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { PruveError, PruveVerifier, type Proof, type TemplateId } from "@pruve/sdk";
import { authenticate, clientCount, createClient, ensureSeed, type ApiClient } from "./keys.js";

/**
 * Pruve Developer API — hosted verification.
 *
 * THE TRADEOFF, STATED PLAINLY: using this endpoint means Pruve sees every
 * proof you verify, and therefore learns which of your customers proved what,
 * and when. That is exactly the visibility the architecture otherwise removes.
 *
 * It exists because not every integrator runs TypeScript, and a PHP or Python
 * backend should not be locked out. But @pruve/sdk is the recommended path for
 * anyone who can run it: same verification, none of the exposure. Every
 * response from this service carries an `x-pruve-privacy` header saying so.
 */

const app = new Hono();
app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"] }));

/** One verifier per API client, so merchants never share request or replay state. */
const verifiers = new Map<string, PruveVerifier>();

function verifierFor(client: ApiClient): PruveVerifier {
  let v = verifiers.get(client.key);
  if (!v) {
    v = new PruveVerifier({
      issuerUrl: process.env.ISSUER_URL ?? "http://localhost:3001",
      verifierId: client.name,
      walletUrl: process.env.WALLET_URL ?? "http://localhost:3000",
      callbackUrl: process.env.PUBLIC_API_URL ? `${process.env.PUBLIC_API_URL}/v1` : undefined,
    });
    verifiers.set(client.key, v);
  }
  return v;
}

// --------------------------------------------------------------- middleware
type Vars = { client: ApiClient };
const v1 = new Hono<{ Variables: Vars }>();

v1.use("*", async (c, next) => {
  const client = authenticate(c.req.header("authorization"));
  if (!client) {
    return c.json(
      {
        error: "Unauthorized",
        detail: "Pass your key as `Authorization: Bearer pk_...`.",
        docs: "/docs",
      },
      401
    );
  }
  c.set("client", client);
  c.header("x-pruve-privacy", "hosted-verification; prefer @pruve/sdk for local verification");
  await next();
});

// ------------------------------------------------------------------ routes

/** Discover what a wallet can prove. */
v1.get("/templates", (c) => c.json({ templates: PruveVerifier.templates() }));

/**
 * Issuer public keys, so an integrator can move to local verification
 * whenever they like. Handing these out is the point: it is what makes
 * leaving this service easy.
 */
v1.get("/public-keys", async (c) => {
  const keys = await verifierFor(c.get("client")).publicKeys();
  return c.json({
    keys,
    note: "Verify locally with @pruve/sdk and we stop seeing your traffic entirely.",
  });
});

/** Ask a customer to prove something. Render `url` as a QR. */
v1.post("/requests", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const req = await verifierFor(c.get("client")).createRequest(
      body?.template as TemplateId,
      body?.metadata
    );
    return c.json(
      {
        id: req.id,
        nonce: req.nonce,
        template: req.template,
        url: req.url,
        expires_at: req.expiresAt,
        metadata: req.metadata ?? null,
      },
      201
    );
  } catch (err) {
    const e = toError(err);
    return c.json(e.body, e.status);
  }
});

/** Poll for the outcome. */
v1.get("/requests/:id", async (c) => {
  const req = await verifierFor(c.get("client")).getRequest(c.req.param("id"));
  if (!req) return c.json({ error: "No such request, or it expired" }, 404);
  return c.json({
    id: req.id,
    status: req.result ? "complete" : "pending",
    template: req.template,
    result: req.result ?? null,
    metadata: req.metadata ?? null,
    expires_at: req.expiresAt,
  });
});

/** The wallet posts here. Public by design — it carries its own nonce. */
app.post("/v1/requests/:id/present", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const proof = body?.proof as Proof | undefined;
  if (!proof) return c.json({ valid: false, reason: "No proof supplied" }, 400);

  // The request id identifies the merchant, so this route needs no API key —
  // the wallet holding a nonce is the authorisation.
  for (const v of verifiers.values()) {
    const req = await v.getRequest(c.req.param("id"));
    if (!req) continue;
    try {
      const result = await v.verifyPresentation(req.id, proof);
      return c.json({
        valid: result.valid,
        reason: result.reason,
        disclosed: result.disclosed,
        issuer: result.issuer,
        receipt_id: result.receipt_id,
        verified_at: result.verified_at,
      });
    } catch (err) {
      const e = toError(err);
      return c.json(e.body, e.status);
    }
  }
  return c.json({ valid: false, reason: "No such request, or it expired" }, 404);
});

/**
 * Verify a standalone proof — no request behind it.
 *
 * Accepts either a decoded `proof` object or the raw `proof` query string
 * from a shared link.
 */
v1.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const verifier = verifierFor(c.get("client"));

  let proof: Proof;
  try {
    proof =
      typeof body?.proof === "string"
        ? PruveVerifier.decodeProof(body.proof)
        : (body?.proof as Proof);
    if (!proof) throw new PruveError("No proof supplied", "invalid_proof");
  } catch (err) {
    const e = toError(err);
    return c.json(e.body, e.status);
  }

  const result = await verifier.verify(proof);
  return c.json({
    valid: result.valid,
    reason: result.reason,
    template: result.template,
    disclosed: result.disclosed,
    issuer: result.issuer,
    receipt_id: result.receipt_id,
    verified_at: result.verified_at,
    trace: result.trace,
  });
});

/**
 * Maps an error to a body + status. Returns the pair rather than a Response so
 * each route can hand it to its own typed `c.json`, which keeps Hono's context
 * generics out of this helper's signature.
 */
function toError(err: unknown): {
  body: { error: string; code?: string };
  status: 400 | 404 | 409 | 500;
} {
  if (err instanceof PruveError) {
    const status = err.code === "unknown_request" ? 404 : err.code === "already_answered" ? 409 : 400;
    return { body: { error: err.message, code: err.code }, status };
  }
  console.error("[developer-api]", err);
  return { body: { error: "Internal error" }, status: 500 };
}

app.route("/v1", v1);

// ------------------------------------------------------------- unauthenticated
app.get("/health", (c) => c.json({ ok: true, service: "developer-api", clients: clientCount() }));

app.get("/docs", (c) =>
  c.json({
    service: "Pruve Developer API",
    recommended: "npm i @pruve/sdk — verify locally, we never see your traffic",
    auth: "Authorization: Bearer pk_...",
    endpoints: {
      "GET  /v1/templates": "What a wallet can prove",
      "GET  /v1/public-keys": "Issuer keys, so you can verify locally instead",
      "POST /v1/requests": "{ template, metadata? } → { id, nonce, url }",
      "GET  /v1/requests/:id": "Poll for the outcome",
      "POST /v1/requests/:id/present": "Wallet posts the proof here (no key needed)",
      "POST /v1/verify": "{ proof } → verdict, for shared links",
    },
    privacy:
      "Hosted verification means Pruve observes each verification. @pruve/sdk does the same checks in your process, without that.",
  })
);

const port = Number(process.env.PORT ?? 3006);
const demo = ensureSeed();
serve({ fetch: app.fetch, port });
console.log(`Developer API → http://localhost:${port}`);
console.log(`  docs        → http://localhost:${port}/docs`);
console.log(`  demo key    → ${demo.key}`);
void createClient;
