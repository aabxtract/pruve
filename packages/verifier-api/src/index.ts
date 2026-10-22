// MUST stay the first import: populates process.env before store.ts reads
// DB_PATH / the Redis credentials and keys.ts reads ISSUER_URL.
import "./bootstrap-env.js";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import { TEMPLATES, verifyProof, type Proof, type TemplateId, type VerifyResult } from "@pruve/core";
import { getPublicKeys } from "./keys.js";
import { store, type PendingRequest } from "./store.js";

const app = new Hono();
app.use("*", cors());

async function logReceipt(
  result: VerifyResult,
  proof: Partial<Proof>,
  verifier_id: string
): Promise<string> {
  const id = `rec_${randomUUID().slice(0, 8)}`;
  await store.addReceipt({
    id,
    proof_id: proof.proof_id ?? null,
    template: proof.template ?? null,
    issuer: result.issuer ?? null,
    result: result.valid ? "valid" : "invalid",
    reason: result.reason ?? null,
    disclosed_keys: JSON.stringify(Object.keys(result.disclosed ?? {})),
    verifier_id,
    verified_at: Math.floor(Date.now() / 1000),
  });
  return id;
}

/** Shared by the link flow and the request flow. */
async function checkProof(
  proof: Proof,
  verifier_id: string,
  expect?: { nonce?: string; audience?: string }
): Promise<VerifyResult> {
  let result: VerifyResult;
  try {
    result = verifyProof(proof, await getPublicKeys(), expect);
  } catch (err) {
    console.error("[verify] unexpected error:", err);
    result = { valid: false, reason: "Verification error" };
  }

  // Single use — enforced, not just claimed in the UI copy.
  if (result.valid && proof.proof_id && !(await store.claimProof(proof.proof_id))) {
    result = { valid: false, reason: "Proof has already been used" };
  }

  // Every check is logged, pass or fail. A rejected check is the one an auditor wants.
  result.receipt_id = await logReceipt(result, proof ?? {}, verifier_id);
  result.verified_at ??= new Date().toISOString();
  result.logged = true;
  return result;
}

app.get("/health", (c) => c.json({ ok: true, service: "verifier-api" }));

// ---- Link / WhatsApp flow -------------------------------------------------
app.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { proof, verifier_id } = body as { proof?: Proof; verifier_id?: string };
  if (!proof) return c.json({ valid: false, reason: "No proof supplied" }, 400);
  return c.json(await checkProof(proof, verifier_id ?? "unknown"));
});

// ---- Verifier-initiated request flow -------------------------------------
app.post("/requests", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { template, verifier_id } = body as { template?: string; verifier_id?: string };
  if (!template || !TEMPLATES[template as TemplateId]) {
    return c.json({ error: "Unknown template" }, 400);
  }
  const req: PendingRequest = {
    id: `req_${randomUUID().slice(0, 12)}`,
    template: template as TemplateId,
    nonce: randomUUID(),
    verifier_id: verifier_id ?? "unknown",
    expires_at: Math.floor(Date.now() / 1000) + 600,
  };
  await store.saveRequest(req);
  return c.json(req);
});

app.get("/requests/:id", async (c) => {
  const req = await store.getRequest(c.req.param("id"));
  if (!req) return c.json({ status: "expired" }, 404);
  return c.json({ status: req.result ? "complete" : "pending", result: req.result ?? null });
});

app.post("/requests/:id/present", async (c) => {
  const req = await store.getRequest(c.req.param("id"));
  if (!req) return c.json({ valid: false, reason: "Request expired or unknown" }, 404);
  if (req.result) return c.json({ valid: false, reason: "This request was already answered" }, 409);

  const body = await c.req.json().catch(() => ({}));
  const { proof } = body as { proof?: Proof };
  if (!proof) return c.json({ valid: false, reason: "No proof supplied" }, 400);

  if (proof.template !== req.template) {
    const result: VerifyResult = { valid: false, reason: "Wrong template for this request" };
    await logReceipt(result, proof, req.verifier_id);
    await store.setRequestResult(req.id, result);
    return c.json(result);
  }

  const result = await checkProof(proof, req.verifier_id, {
    nonce: req.nonce,
    audience: req.verifier_id,
  });
  await store.setRequestResult(req.id, result);
  return c.json(result);
});

// ---- Audit log -----------------------------------------------------------
app.get("/receipts", async (c) => c.json(await store.recentReceipts(50)));

// Vercel invokes the default export itself; only listen on a port when running
// as a plain Node process (local dev, tests).
export default app;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 3003);
  serve({ fetch: app.fetch, port });
  console.log(`Verifier API → http://localhost:${port}`);
}
