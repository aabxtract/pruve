/**
 * Tests the public integration surface: the SDK and the hosted REST API.
 *
 * These are the two ways a third party consumes Pruve. The SDK path is the
 * one we recommend — it proves a merchant can verify without Pruve ever
 * seeing the traffic. The REST path exists for integrators who cannot run
 * TypeScript, and is tested here against the same proofs.
 *
 * Run with the stack up: npm run test:api
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PruveVerifier, PruveError, b64uFromString, TEMPLATES, type Proof, type WalletCredential } from "@pruve/sdk";

const ISSUER = process.env.ISSUER_URL ?? "http://localhost:3001";
const API = process.env.DEVELOPER_API_URL ?? "http://localhost:3006";

let fails = 0;
const ok = (m: string, d = "") => console.log(`  ✓  ${m}${d ? `  ${d}` : ""}`);
const bad = (m: string, d = "") => { fails++; console.log(`  ✗  ${m}${d ? `  ${d}` : ""}`); };
const head = (t: string) => console.log(`\n${t}`);

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

function buildProof(
  entry: WalletCredential,
  id: keyof typeof TEMPLATES,
  bind: { nonce?: string; audience?: string } = {}
): Proof {
  const t = TEMPLATES[id];
  const now = Math.floor(Date.now() / 1000);
  return {
    proof_id: `prf_api_${randomUUID()}`,
    template: id,
    credential: entry.credential,
    disclosures: entry.disclosures.filter(([, k]) => t.reveals.includes(k)),
    nonce: bind.nonce,
    audience: bind.audience,
    generated_at: now,
    expires_at: now + 300,
  };
}

async function main() {
  console.log("Public integration surface");

  const samples = await (await fetch(`${ISSUER}/samples`)).json();
  const student = (await (await post(`${ISSUER}/issue/nimc`, { nin: samples.student.nin })).json()) as WalletCredential;
  const older = (await (await post(`${ISSUER}/issue/nimc`, { nin: samples.adult.nin })).json()) as WalletCredential;

  // ============================================================ SDK
  head("SDK — @pruve/sdk, verification inside the integrator's process");

  const sdk = new PruveVerifier({
    issuerUrl: ISSUER,
    verifierId: "test_merchant",
    walletUrl: "https://wallet.example",
    callbackUrl: "https://merchant.example/api/pruve",
  });

  const templates = PruveVerifier.templates();
  templates.length >= 6
    ? ok("templates discoverable", `${templates.length} available`)
    : bad("template discovery", String(templates.length));

  const req = await sdk.createRequest("ng_under_26", { order: "ORD-1001" });
  ok("createRequest", req.id);
  if (req.url.includes("wallet.example/share") && req.url.includes(`nonce=${req.nonce}`)) {
    ok("QR deep link built", `${req.url.length} bytes`);
  } else bad("deep link malformed", req.url);
  req.metadata?.order === "ORD-1001" ? ok("metadata round-trips") : bad("metadata lost");

  const good = buildProof(student, "ng_under_26", { nonce: req.nonce, audience: "test_merchant" });
  const v = await sdk.verifyPresentation(req.id, good);
  v.valid ? ok("verifyPresentation accepted", v.receipt_id) : bad("rejected", v.reason);
  v.trace?.length >= 3 ? ok("trace captured", `${v.trace.length} steps`) : bad("no trace");

  // Same request twice must not be answerable.
  try {
    await sdk.verifyPresentation(req.id, good);
    bad("request answered twice");
  } catch (e) {
    e instanceof PruveError && e.code === "already_answered"
      ? ok("request cannot be answered twice", e.code)
      : bad("wrong error", String(e));
  }

  // Replay across a fresh request must still fail.
  const req2 = await sdk.createRequest("ng_under_26");
  const replayed = { ...good, nonce: req2.nonce };
  const rv = await sdk.verifyPresentation(req2.id, replayed);
  !rv.valid && (rv.reason ?? "").includes("already been used")
    ? ok("spent proof refused on a new request", rv.reason)
    : bad("replay not caught", JSON.stringify(rv).slice(0, 80));

  // Template mismatch.
  const req3 = await sdk.createRequest("i_am_adult");
  try {
    await sdk.verifyPresentation(req3.id, buildProof(student, "ng_under_26", { nonce: req3.nonce }));
    bad("template mismatch accepted");
  } catch (e) {
    e instanceof PruveError && e.code === "template_mismatch"
      ? ok("template mismatch rejected", e.code)
      : bad("wrong error", String(e));
  }

  // Wrong person.
  const req4 = await sdk.createRequest("ng_under_26");
  const wrongPerson = await sdk.verifyPresentation(
    req4.id,
    buildProof(older, "ng_under_26", { nonce: req4.nonce, audience: "test_merchant" })
  );
  !wrongPerson.valid ? ok("ineligible customer refused", wrongPerson.reason) : bad("should have failed");

  // Link flow.
  const linkProof = buildProof(student, "i_am_adult");
  const encoded = b64uFromString(JSON.stringify(linkProof));
  const decoded = PruveVerifier.decodeProof(encoded);
  const linkResult = await sdk.verify(decoded);
  linkResult.valid ? ok("standalone link proof verified", linkResult.receipt_id) : bad("link failed", linkResult.reason);

  // Offline: the SDK must keep working with the issuer unreachable.
  const offline = new PruveVerifier({
    issuerUrl: "http://127.0.0.1:9",
    verifierId: "offline_merchant",
    keyCache: {
      read: () => sdkKeysSnapshot,
      write: () => {},
    },
  });
  const offlineResult = await offline.verify(buildProof(student, "i_am_adult"));
  offlineResult.valid
    ? ok("verifies with the issuer unreachable", "cached keys")
    : bad("offline verification failed", offlineResult.reason);

  // ============================================================ REST
  head("REST — hosted verification for non-JS integrators");

  const keyFile = path.resolve(import.meta.dirname, "../packages/developer-api/.api-keys.json");
  if (!fs.existsSync(keyFile)) {
    bad("no API keys file — start the developer API once");
    return finish();
  }
  const key = (JSON.parse(fs.readFileSync(keyFile, "utf-8")) as Array<{ name: string; key: string }>)
    .find((c) => c.name === "demo")!.key;
  const auth = { Authorization: `Bearer ${key}` };

  const unauth = await fetch(`${API}/v1/templates`);
  unauth.status === 401 ? ok("rejects a missing key", "401") : bad("auth not enforced", String(unauth.status));

  const badKey = await fetch(`${API}/v1/templates`, { headers: { Authorization: "Bearer pk_live_wrong" } });
  badKey.status === 401 ? ok("rejects a wrong key", "401") : bad("bad key accepted", String(badKey.status));

  const tRes = await fetch(`${API}/v1/templates`, { headers: auth });
  const tJson = await tRes.json();
  tJson.templates?.length >= 6 ? ok("GET /v1/templates", `${tJson.templates.length}`) : bad("templates");
  tRes.headers.get("x-pruve-privacy")
    ? ok("privacy header present", "points integrators at the SDK")
    : bad("no privacy header");

  const pk = await (await fetch(`${API}/v1/public-keys`, { headers: auth })).json();
  pk.keys?.nimc ? ok("GET /v1/public-keys", "lets an integrator leave hosted mode") : bad("public keys");

  const apiReq = await (await post(`${API}/v1/requests`, { template: "ng_under_26", metadata: { order: "ORD-2002" } }, auth)).json();
  apiReq.id && apiReq.nonce ? ok("POST /v1/requests", apiReq.id) : bad("request creation", JSON.stringify(apiReq).slice(0, 80));

  // The wallet posts without a key — the nonce is the authorisation.
  const apiProof = buildProof(student, "ng_under_26", { nonce: apiReq.nonce, audience: "demo" });
  const presented = await (await post(`${API}/v1/requests/${apiReq.id}/present`, { proof: apiProof })).json();
  presented.valid ? ok("POST /v1/requests/:id/present (no key)", presented.receipt_id) : bad("present failed", presented.reason);

  const polled = await (await fetch(`${API}/v1/requests/${apiReq.id}`, { headers: auth })).json();
  polled.status === "complete" && polled.metadata?.order === "ORD-2002"
    ? ok("GET /v1/requests/:id", "complete, metadata intact")
    : bad("poll failed", JSON.stringify(polled).slice(0, 80));

  // Raw encoded proof, as a shared link would carry it. Uses a bank
  // credential so this is a clean accept rather than a template mismatch.
  const banked = (await (await post(`${ISSUER}/issue/bank`, { account: samples.student.account })).json()) as WalletCredential;
  const rawLink = b64uFromString(JSON.stringify(buildProof(banked, "i_am_verified")));
  const rawRes = await (await post(`${API}/v1/verify`, { proof: rawLink }, auth)).json();
  rawRes.valid
    ? ok("POST /v1/verify accepts a base64url string", rawRes.receipt_id)
    : bad("encoded link proof failed", rawRes.reason);

  const tampered = buildProof(student, "i_am_adult");
  tampered.disclosures = [[tampered.disclosures[0][0], "is_adult", false]];
  const tRes2 = await (await post(`${API}/v1/verify`, { proof: tampered }, auth)).json();
  tRes2.valid === false ? ok("tampered proof rejected over REST", tRes2.reason) : bad("tamper accepted");

  finish();
}

// Captured before the offline verifier is constructed.
let sdkKeysSnapshot: Awaited<ReturnType<PruveVerifier["publicKeys"]>> | null = null;

function finish() {
  console.log(`\n${fails === 0 ? "INTEGRATION SURFACE WORKS" : `${fails} FAILURE(S)`}\n`);
  process.exitCode = fails === 0 ? 0 : 1;
}

// Prime the key snapshot the offline test relies on.
(async () => {
  const probe = new PruveVerifier({ issuerUrl: ISSUER, verifierId: "probe" });
  sdkKeysSnapshot = await probe.publicKeys();
  await main();
})().catch((e) => {
  console.error("crashed:", e);
  process.exitCode = 1;
});
