/**
 * Demo rehearsal — walks all five scenarios against the live stack and prints
 * what is actually on the wire at each step.
 *
 * This is the script to run before presenting: it shows the exact payload you
 * will be inviting judges to inspect in Scenario 4.
 * Run with the stack up: npm run rehearse
 */
import {
  TEMPLATES,
  b64uFromString,
  stringFromB64u,
  type Proof,
  type TemplateId,
  type WalletCredential,
} from "@pruve/core";
import { randomUUID } from "node:crypto";

const ISSUER = process.env.ISSUER_URL ?? "http://localhost:3001";
const API = process.env.VERIFIER_API_URL ?? "http://localhost:3003";
const VERIFIER = process.env.VERIFIER_URL ?? "http://localhost:3002";
const HOLDER = process.env.HOLDER_URL ?? "http://localhost:3000";

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const hr = (t: string) => console.log(`\n${"─".repeat(64)}\n${t}\n${"─".repeat(64)}`);
const step = (n: string, s: string) => console.log(`  ${n.padEnd(4)} ${s}`);
let fails = 0;
const expect = (label: string, ok: boolean, got = "") => {
  if (!ok) fails++;
  console.log(`  ${ok ? "✓" : "✗"}    ${label}${got ? `  → ${got}` : ""}`);
};

function buildProof(
  entry: WalletCredential,
  id: TemplateId,
  bind: { nonce?: string; audience?: string } = {}
): Proof {
  const t = TEMPLATES[id];
  const now = Math.floor(Date.now() / 1000);
  return {
    proof_id: `prf_${randomUUID()}`,
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
  // ---------------------------------------------------------------- setup
  hr("SETUP — issuing credentials from the mock issuer");
  const s = await (await fetch(`${ISSUER}/samples`)).json();
  const adult = (await (await post(`${ISSUER}/issue/nimc`, { nin: s.student.nin })).json()) as WalletCredential;
  step("NIN", `${s.student.nin}  → ${s.student.name}, age ${s.student.age}`);
  console.log("       wallet holds these privately:");
  for (const [salt, k, v] of adult.disclosures) {
    console.log(`         ${k.padEnd(14)} = ${String(v).padEnd(6)}  salt ${salt.slice(0, 8)}…`);
  }
  console.log("       the SIGNED credential contains only:");
  console.log(`         claim_hashes  ${JSON.stringify(adult.credential.claim_hashes)}`);

  const minor = (await (await post(`${ISSUER}/issue/nimc`, { nin: s.minor.nin })).json()) as WalletCredential;
  const bank = (await (await post(`${ISSUER}/issue/bank`, { bvn: s.student.bvn })).json()) as WalletCredential;

  // ----------------------------------------------------------- scenario 1
  hr("SCENARIO 1 — Age check at a venue (bound request flow)");
  const req = await (await post(`${API}/requests`, { template: "i_am_adult", verifier_id: "pruve_demo_venue" })).json();
  step("1.", "Verifier taps “I am an adult” → request created");
  console.log(`       nonce ${req.nonce}`);
  const deepLink = `${HOLDER}/share?template=i_am_adult&rid=${req.id}&nonce=${req.nonce}&aud=pruve_demo_venue&api=${encodeURIComponent(API)}`;
  step("2.", `QR encodes a deep link (${deepLink.length} bytes — comfortably scannable)`);
  step("3.", "Holder's native camera opens it; wallet shows the confirm screen");

  const bound = buildProof(adult, "i_am_adult", { nonce: req.nonce, audience: "pruve_demo_venue" });
  const r1 = await (await post(`${API}/requests/${req.id}/present`, { proof: bound })).json();
  step("4.", "Holder taps Send proof");
  expect("verifier flips green", r1.valid === true, r1.reason);
  expect("discloses exactly one field", JSON.stringify(r1.disclosed) === '{"is_adult":true}', JSON.stringify(r1.disclosed));
  expect("receipt written", !!r1.receipt_id, r1.receipt_id);
  console.log(`\n  SAY: "The bouncer never saw the NIN, the date of birth, or even the age.`);
  console.log(`       And NIMC was never told this check happened."`);

  // ----------------------------------------------------------- scenario 2
  hr("SCENARIO 2 — Income check over WhatsApp (link flow)");
  const incomeProof = buildProof(bank, "i_earn_enough");
  const link = `${VERIFIER}/verify?proof=${b64uFromString(JSON.stringify(incomeProof))}`;
  step("1.", `Wallet generates a link (${link.length} bytes)`);
  const r2 = await (await post(`${API}/verify`, { proof: incomeProof, verifier_id: "landlord" })).json();
  expect("landlord's browser shows green", r2.valid === true, r2.reason);
  expect("income BAND never disclosed", !JSON.stringify(r2.disclosed).includes("500k"), JSON.stringify(r2.disclosed));
  console.log(`\n  SAY: "He learned Tunde clears N100k. Not his salary, not his`);
  console.log(`       bracket, not his balance. And he installed nothing."`);

  // ----------------------------------------------------------- scenario 3
  hr("SCENARIO 3 — Under 18 (a legitimate rejection, not a defence)");
  step("1.", `Same flow, NIN ${s.minor.nin} → ${s.minor.name}, age ${s.minor.age}`);
  const r3 = await (await post(`${API}/verify`, { proof: buildProof(minor, "i_am_adult"), verifier_id: "pruve_demo_venue" })).json();
  expect("correctly rejected", r3.valid === false, r3.reason);
  expect("rejection is still receipted", !!r3.receipt_id, r3.receipt_id);
  console.log(`\n  SAY: "The system isn't defending itself here — it's just working.`);
  console.log(`       The venue still gets a receipt proving they checked."`);

  // ----------------------------------------------------------- scenario 4
  hr("SCENARIO 4 — Tampering (the one that invites inspection)");
  const clean = buildProof(adult, "i_am_adult");
  const wire = JSON.stringify(clean);
  step("1.", "Judge decodes the base64url from the link. Here is everything inside:");
  console.log(`\n       credential.claim_hashes : ${JSON.stringify(clean.credential.claim_hashes)}`);
  console.log(`       disclosures             : ${JSON.stringify(clean.disclosures)}`);
  expect("age_band absent from the wire", !wire.includes("18-25"));
  expect("nationality absent from the wire", !wire.includes('"NG"'));
  expect("2 of 3 claims are unreadable hashes", clean.credential.claim_hashes.length === 3 && clean.disclosures.length === 1);

  step("2.", "Judge flips is_adult from true to false and resubmits");
  const forged = JSON.parse(wire) as Proof;
  forged.disclosures = [[forged.disclosures[0][0], "is_adult", false]];
  const r4 = await (await post(`${API}/verify`, { proof: forged, verifier_id: "pruve_demo_venue" })).json();
  expect("rejected", r4.valid === false, r4.reason);

  step("3.", "Judge injects a claim they never had");
  const injected = JSON.parse(wire) as Proof;
  injected.disclosures = [...injected.disclosures, ["fakesalt", "is_ceo", true]];
  const r5 = await (await post(`${API}/verify`, { proof: injected, verifier_id: "pruve_demo_venue" })).json();
  expect("rejected", r5.valid === false, r5.reason);
  console.log(`\n  SAY: "Open the payload, go ahead. The undisclosed claims are hashes`);
  console.log(`       of salts that never left the phone. You can't read them, and`);
  console.log(`       you can't forge one — changing a value breaks its commitment."`);

  // ----------------------------------------------------------- scenario 5
  hr("SCENARIO 5 — Replay");
  const bankProof = buildProof(bank, "i_am_verified");
  step("1.", "Same proof link submitted twice");
  const first = await (await post(`${API}/verify`, { proof: bankProof, verifier_id: "shop" })).json();
  expect("first use accepted", first.valid === true, first.reason);
  const second = await (await post(`${API}/verify`, { proof: bankProof, verifier_id: "shop" })).json();
  expect("second use rejected", second.valid === false, second.reason);

  // -------------------------------------------------------------- receipts
  hr("AUDIT LOG — what the verifier actually stores");
  const receipts = (await (await fetch(`${API}/receipts`)).json()) as Array<Record<string, unknown>>;
  console.log("  result    template          disclosed_keys          reason");
  for (const r of receipts.slice(0, 6)) {
    console.log(
      `  ${String(r.result).padEnd(9)} ${String(r.template ?? "-").padEnd(17)} ${String(r.disclosed_keys).padEnd(23)} ${String(r.reason ?? "")}`
    );
  }
  const all = JSON.stringify(receipts);
  expect("no claim VALUES anywhere in the log", !all.includes("18-25") && !all.includes('"NG"'));
  expect("failures are logged too", receipts.some((r) => r.result === "invalid"));

  hr(fails === 0 ? "REHEARSAL CLEAN — all five scenarios behave as scripted" : `REHEARSAL — ${fails} unexpected result(s)`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((e) => { console.error("rehearsal crashed:", e); process.exitCode = 1; });
