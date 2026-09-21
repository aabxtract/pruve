/**
 * End-to-end smoke test: issuer API -> proof -> verifier API.
 * Run with both servers up: `npx tsx scripts/smoke.ts`
 * Covers guide Scenarios 2 (link flow), 3 (legitimate rejection),
 * 4 (tampering) and 5 (replay), plus the receipts audit log.
 */
import { TEMPLATES, b64uFromString, stringFromB64u, type Proof, type PublicKeys } from "@pruve/core";
// NOTE: holder-side proof construction is duplicated here in ~10 lines so this
// script never imports app code — the wallet's lib/proof.ts is tested by use.
import type { WalletCredential } from "@pruve/core";

const ISSUER = process.env.ISSUER_URL ?? "http://localhost:3001";
const API = process.env.VERIFIER_API_URL ?? "http://localhost:3003";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function buildProof(entry: WalletCredential, templateId: keyof typeof TEMPLATES): Proof {
  const t = TEMPLATES[templateId];
  const now = Math.floor(Date.now() / 1000);
  return {
    proof_id: `prf_smoke_${Math.random().toString(36).slice(2)}`,
    template: templateId,
    credential: entry.credential,
    disclosures: entry.disclosures.filter(([, k]) => t.reveals.includes(k)),
    generated_at: now,
    expires_at: now + 300,
  };
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Pulled from the issuer's synthetic registry rather than hardcoded, so the
// test follows the dataset instead of drifting out of sync with it.
let adultNin = "";
let minorNin = "";

async function main() {
console.log("Issuer health");
check("issuer /health", (await (await fetch(`${ISSUER}/health`)).json()).ok === true);
check("verifier-api /health", (await (await fetch(`${API}/health`)).json()).ok === true);

const pubkeys = (await (await fetch(`${ISSUER}/public-keys`)).json()) as PublicKeys;
check("public keys for all issuers", !!pubkeys.nimc && !!pubkeys.bank && !!pubkeys.card);

const samples = await (await fetch(`${ISSUER}/samples`)).json();
adultNin = samples.student.nin;
minorNin = samples.minor.nin;
check(
  "registry samples resolved",
  /^\d{11}$/.test(adultNin) && /^\d{11}$/.test(minorNin),
  `student ${adultNin} (${samples.student.age}), minor ${minorNin} (${samples.minor.age})`
);

console.log("Issuance");
const adultRes = await post(`${ISSUER}/issue/nimc`, { nin: adultNin });
check("adult issuance 200", adultRes.ok);
const adult = (await adultRes.json()) as WalletCredential;
check("credential carries no claim values", !JSON.stringify(adult.credential).includes("18-25"));

const minor = (await (await post(`${ISSUER}/issue/nimc`, { nin: minorNin })).json()) as WalletCredential;
const badNin = await post(`${ISSUER}/issue/nimc`, { nin: "123" });
check("bad NIN rejected with 400", badNin.status === 400);

console.log("Link flow (Scenario 2)");
const proof = buildProof(adult, "i_am_adult");
// Through the real transport: JSON -> base64url -> URL -> back.
const viaUrl = new URL(`https://v.example/verify?proof=${b64uFromString(JSON.stringify(proof))}`);
const decoded = JSON.parse(stringFromB64u(viaUrl.searchParams.get("proof")!));
const v1 = await (await post(`${API}/verify`, { proof: decoded, verifier_id: "smoke" })).json();
check("adult proof verifies", v1.valid === true, v1.reason);
check("receipt issued", typeof v1.receipt_id === "string");

console.log("Legitimate rejection (Scenario 3)");
const minorProof = buildProof(minor, "i_am_adult");
const v2 = await (await post(`${API}/verify`, { proof: minorProof, verifier_id: "smoke" })).json();
check("under-18 correctly fails", v2.valid === false && (v2.reason ?? "").includes("Does not meet"), v2.reason);
check("rejection still gets a receipt", typeof v2.receipt_id === "string");

console.log("Tampering (Scenario 4)");
const flipped = buildProof(adult, "i_am_adult");
flipped.disclosures = [[flipped.disclosures[0][0], "is_adult", false]];
const v3 = await (await post(`${API}/verify`, { proof: flipped, verifier_id: "smoke" })).json();
check("flipped value rejected", v3.valid === false, v3.reason);

console.log("Replay (Scenario 5)");
const v4 = await (await post(`${API}/verify`, { proof: decoded, verifier_id: "smoke" })).json();
check("second use rejected", v4.valid === false && (v4.reason ?? "").includes("already been used"), v4.reason);

console.log("Bound request flow (Scenario 1)");
const req = await (await post(`${API}/requests`, { template: "ng_under_26", verifier_id: "venue_1" })).json();
check("request created with nonce", !!req.id && !!req.nonce);
const bound = buildProof(adult, "ng_under_26");
bound.nonce = req.nonce;
bound.audience = "venue_1";
const v5 = await (await post(`${API}/requests/${req.id}/present`, { proof: bound })).json();
check("bound proof accepted", v5.valid === true, v5.reason);
const poll = await (await fetch(`${API}/requests/${req.id}`)).json();
check("request polls complete", poll.status === "complete" && poll.result?.valid === true);
const v6 = await (await post(`${API}/requests/${req.id}/present`, { proof: bound })).json();
check("request cannot be answered twice", v6.valid === false, JSON.stringify(v6));

console.log("Audit log");
const receipts = (await (await fetch(`${API}/receipts`)).json()) as Array<{ disclosed_keys: string }>;
check("receipts recorded", receipts.length >= 5, `got ${receipts.length}`);
check(
  "receipts store keys, not values",
  receipts.every((r) => !r.disclosed_keys.includes("18-25") && !r.disclosed_keys.includes("true"))
);

console.log(`\n${failed === 0 ? "SMOKE ALL PASSED" : "SMOKE FAILURES"} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke script crashed:", err);
  process.exit(1);
});
