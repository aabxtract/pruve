/**
 * Tests Campus Store — the third-party merchant integration.
 *
 * What this proves, and what nothing else in the suite proves: a site that
 * shares no database, session or API with Pruve can verify a proof correctly
 * using only the published library and cached public keys. Pruve is not in
 * the request path at any point below.
 *
 * Run with the stack up: npm run test:shop
 */
import { TEMPLATES, type Proof, type WalletCredential } from "@pruve/core";
import { randomUUID } from "node:crypto";

const ISSUER = process.env.ISSUER_URL ?? "http://localhost:3001";
const SHOP = process.env.SHOP_URL ?? "http://localhost:3005";

let fails = 0;
const ok = (m: string, d = "") => console.log(`  ✓  ${m}${d ? `  ${d}` : ""}`);
const bad = (m: string, d = "") => { fails++; console.log(`  ✗  ${m}${d ? `  ${d}` : ""}`); };
const head = (t: string) => console.log(`\n${t}`);

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    proof_id: `prf_shop_${randomUUID()}`,
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
  console.log("Campus Store — third-party merchant integration");

  // Registry samples so the test uses real records.
  const samples = await (await fetch(`${ISSUER}/samples`)).json();
  head("Setup");
  ok("registry samples", `student ${samples.student.nin} (${samples.student.name}, ${samples.student.age})`);

  const student = (await (await post(`${ISSUER}/issue/nimc`, { nin: samples.student.nin })).json()) as WalletCredential;
  const adult = (await (await post(`${ISSUER}/issue/nimc`, { nin: samples.adult.nin })).json()) as WalletCredential;
  ok("credentials issued for a student and a non-student");

  // ------------------------------------------------- happy path
  head("1. Student unlocks pricing");
  const req = await (await post(`${SHOP}/api/requests`, { template: "ng_under_26" })).json();
  ok("store created its own request", `nonce ${String(req.nonce).slice(0, 8)}…`);

  const proof = buildProof(student, "ng_under_26", { nonce: req.nonce, audience: "campus_store" });
  const res = await (await post(`${SHOP}/api/requests/${req.id}/present`, { proof })).json();
  res.valid ? ok("store verified it in-process", res.receipt_id) : bad("rejected", res.reason);

  const polled = await (await fetch(`${SHOP}/api/requests/${req.id}`)).json();
  polled.status === "complete" ? ok("store's own poll returns complete") : bad("poll failed");

  // The trace is what the inspector renders.
  const trace = polled.trace as Array<{ label: string; ok: boolean; ms: number }>;
  if (Array.isArray(trace) && trace.length >= 3) {
    ok(`verification trace captured`, `${trace.length} steps`);
    for (const s of trace) console.log(`       ${s.ok ? "·" : "!"} ${s.label} — ${s.ms}ms`);
  } else bad("no trace for the inspector");

  if (polled.proof?.credential?.claim_hashes?.length === 3 && polled.proof.disclosures.length === 3) {
    ok("inspector has the real payload", "3 commitments, 3 disclosed");
  } else bad("inspector payload wrong", JSON.stringify(polled.proof?.disclosures?.length));

  // ------------------------------------------------- rejection
  head("2. Non-student is refused");
  const req2 = await (await post(`${SHOP}/api/requests`, { template: "ng_under_26" })).json();
  const p2 = buildProof(adult, "ng_under_26", { nonce: req2.nonce, audience: "campus_store" });
  const r2 = await (await post(`${SHOP}/api/requests/${req2.id}/present`, { proof: p2 })).json();
  if (!r2.valid && (r2.reason ?? "").includes("Does not meet")) ok("correctly refused", r2.reason);
  else bad("should have been refused", JSON.stringify(r2).slice(0, 90));

  // ------------------------------------------------- nonce binding
  head("3. Proof from another merchant's request");
  const req3 = await (await post(`${SHOP}/api/requests`, { template: "ng_under_26" })).json();
  const stolen = buildProof(student, "ng_under_26", { nonce: "some-other-nonce", audience: "campus_store" });
  const r3 = await (await post(`${SHOP}/api/requests/${req3.id}/present`, { proof: stolen })).json();
  if (!r3.valid) ok("rejected — nonce does not match this request", r3.reason);
  else bad("nonce binding not enforced");

  // ------------------------------------------------- tamper demo
  head("4. Tamper controls (what the audience gets to try)");
  for (const mutation of ["flip_value", "inject_claim", "drop_disclosure", "swap_issuer"] as const) {
    const t = await (await post(`${SHOP}/api/tamper`, { proof: polled.proof, mutation })).json();
    if (t.result?.valid === false) {
      ok(`${mutation.padEnd(17)} rejected in ${t.ms}ms`, t.result.reason ?? "");
    } else {
      bad(`${mutation} was ACCEPTED`, JSON.stringify(t.result ?? t).slice(0, 90));
    }
  }

  // ------------------------------------------------- replay
  head("5. Replay against the store");
  const req5 = await (await post(`${SHOP}/api/requests`, { template: "ng_under_26" })).json();
  const again = await (await post(`${SHOP}/api/requests/${req5.id}/present`, { proof })).json();
  if (!again.valid) ok("already-redeemed proof refused", again.reason);
  else bad("replay not blocked at the store");

  console.log(`\n${fails === 0 ? "MERCHANT INTEGRATION WORKS" : `${fails} FAILURE(S)`}\n`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((e) => { console.error("crashed:", e); process.exitCode = 1; });
