/**
 * Crypto round-trip tests for @pruve/core.
 * Run: npx tsx scripts/core.test.ts
 *
 * These cover the three things that silently break a commitment scheme:
 * canonicalisation drift, base64url mangling, and a disclosure check that
 * accepts claims the issuer never signed.
 */
import {
  TEMPLATES,
  b64uFromString,
  canonicalize,
  generateKeypair,
  hashDisclosure,
  randomSalt,
  signPayload,
  stringFromB64u,
  verifyPayload,
  verifyProof,
  type Disclosure,
  type Proof,
  type PublicKeys,
  type SignedCredential,
  type TemplateId,
  type WalletCredential,
} from "@pruve/core";

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

function section(title: string) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------- fixtures
const keys = { nimc: generateKeypair(), bank: generateKeypair() };
const publicKeys: PublicKeys = {
  nimc: keys.nimc.publicKey,
  bank: keys.bank.publicKey,
};

function issue(
  type: "nimc" | "bank",
  claims: Record<string, unknown>,
  opts: { expiresIn?: number } = {}
): WalletCredential {
  const disclosures: Disclosure[] = Object.entries(claims).map(([k, v]) => [
    randomSalt(),
    k,
    v,
  ]);
  const now = Math.floor(Date.now() / 1000);
  const unsigned: Omit<SignedCredential, "signature"> = {
    id: `cred_test_${type}`,
    type,
    issuer: `mock-${type}.pruve.ng`,
    issued_at: now,
    expires_at: now + (opts.expiresIn ?? 31_536_000),
    claim_hashes: disclosures.map(hashDisclosure).sort(),
  };
  return {
    credential: { ...unsigned, signature: signPayload(unsigned, keys[type].privateKey) },
    disclosures,
  };
}

function buildProof(
  entry: WalletCredential,
  templateId: TemplateId,
  binding: { nonce?: string; audience?: string } = {},
  overrides: Partial<Proof> = {}
): Proof {
  const t = TEMPLATES[templateId];
  const now = Math.floor(Date.now() / 1000);
  return {
    proof_id: `prf_${Math.random().toString(36).slice(2)}`,
    template: templateId,
    credential: entry.credential,
    disclosures: entry.disclosures.filter(([, k]) => t.reveals.includes(k)),
    nonce: binding.nonce,
    audience: binding.audience,
    generated_at: now,
    expires_at: now + 300,
    ...overrides,
  };
}

const ADULT = { is_adult: true, age_band: "18-25", nationality: "NG" };
const MINOR = { is_adult: false, age_band: "under_18", nationality: "NG" };

// ------------------------------------------------------------ canonical
section("Canonical JSON");
{
  const a = canonicalize({ b: 1, a: 2, c: { z: 1, y: 2 } });
  const b = canonicalize({ c: { y: 2, z: 1 }, a: 2, b: 1 });
  check("key order does not affect output", a === b, `${a} vs ${b}`);
  check(
    "output is stable across a JSON round-trip",
    canonicalize(JSON.parse(JSON.stringify({ z: 1, a: [3, { q: 1, b: 2 }] }))) ===
      canonicalize({ a: [3, { b: 2, q: 1 }], z: 1 })
  );
  check("undefined members are dropped", canonicalize({ a: 1, b: undefined }) === '{"a":1}');
  check("arrays keep their order", canonicalize([3, 1, 2]) === "[3,1,2]");
}

// ---------------------------------------------------------------- b64u
section("base64url");
{
  const payload = JSON.stringify({ msg: "naira ₦ symbol, emoji 🪪, quotes \"'" });
  check("round-trips UTF-8", stringFromB64u(b64uFromString(payload)) === payload);

  // The v1 bug: raw base64 in a query value loses "+" to whitespace stripping.
  let sawPlus = false;
  let sawSlash = false;
  for (let i = 0; i < 300; i++) {
    const blob = b64uFromString(JSON.stringify({ r: randomSalt() + randomSalt() }));
    if (blob.includes("+")) sawPlus = true;
    if (blob.includes("/")) sawSlash = true;
  }
  check("never emits '+'", !sawPlus);
  check("never emits '/'", !sawSlash);

  const enc = b64uFromString(payload);
  const viaQuery = new URLSearchParams(`proof=${enc}`).get("proof")!;
  check("survives a URLSearchParams round-trip", stringFromB64u(viaQuery) === payload);
}

// -------------------------------------------------------------- signature
section("Ed25519");
{
  const payload = { a: 1, b: "two" };
  const sig = signPayload(payload, keys.nimc.privateKey);
  check("valid signature verifies", verifyPayload(sig, payload, keys.nimc.publicKey));
  check(
    "verifies regardless of key order",
    verifyPayload(sig, { b: "two", a: 1 }, keys.nimc.publicKey)
  );
  check("wrong key is rejected", !verifyPayload(sig, payload, keys.bank.publicKey));
  check("mutated payload is rejected", !verifyPayload(sig, { a: 2, b: "two" }, keys.nimc.publicKey));
  check("garbage signature is rejected, not thrown", !verifyPayload("!!!not-b64u!!!", payload, keys.nimc.publicKey));
}

// ------------------------------------------------------- privacy property
section("Privacy property — the thing v1 got wrong");
{
  const entry = issue("nimc", ADULT);
  const proof = buildProof(entry, "i_am_adult");
  const wire = JSON.stringify(proof);

  check("credential carries no claim values", !JSON.stringify(proof.credential).includes("18-25"));
  check("undisclosed age_band is absent from the wire", !wire.includes("18-25"));
  check("undisclosed nationality is absent from the wire", !wire.includes('"NG"'));
  check("exactly one disclosure travels", proof.disclosures.length === 1);
  check("the credential holds all three commitments", proof.credential.claim_hashes.length === 3);
}

// --------------------------------------------------------------- verify
section("verifyProof — happy paths");
{
  const nimc = issue("nimc", ADULT);
  const bank = issue("bank", {
    account_status: "active",
    bvn_verified: true,
    income_at_least_100k: true,
    income_at_least_500k: false,
  });

  const r1 = verifyProof(buildProof(nimc, "i_am_adult"), publicKeys);
  check("i_am_adult passes", r1.valid, r1.reason);
  check("discloses only is_adult", JSON.stringify(r1.disclosed) === '{"is_adult":true}');

  const r2 = verifyProof(buildProof(nimc, "ng_under_26"), publicKeys);
  check("ng_under_26 passes", r2.valid, r2.reason);

  const r3 = verifyProof(buildProof(bank, "i_earn_enough"), publicKeys);
  check("i_earn_enough passes", r3.valid, r3.reason);
  check("income bracket is not revealed", !JSON.stringify(r3.disclosed).includes("500k"));

  const r4 = verifyProof(buildProof(bank, "i_am_verified"), publicKeys);
  check("i_am_verified passes", r4.valid, r4.reason);

  // Survives the actual transport: JSON -> base64url -> URL -> back.
  const encoded = b64uFromString(JSON.stringify(buildProof(nimc, "i_am_adult")));
  const url = new URL(`https://v.example/verify?proof=${encoded}`);
  const decoded = JSON.parse(stringFromB64u(url.searchParams.get("proof")!));
  const r5 = verifyProof(decoded, publicKeys);
  check("survives the QR/link transport end to end", r5.valid, r5.reason);
}

section("verifyProof — rejections");
{
  const nimc = issue("nimc", ADULT);
  const minor = issue("nimc", MINOR);

  const expectFail = (name: string, p: unknown, needle: string, expect?: { nonce?: string; audience?: string }) => {
    const r = verifyProof(p as Proof, publicKeys, expect);
    check(`${name} → "${needle}"`, !r.valid && (r.reason ?? "").includes(needle), `got: ${r.reason}`);
  };

  // Scenario 3: a legitimate rejection.
  expectFail("under-18 claiming adult", buildProof(minor, "i_am_adult"), "Does not meet");

  // Scenario 4: tampering.
  const flipped = buildProof(nimc, "i_am_adult");
  flipped.disclosures = [[flipped.disclosures[0][0], "is_adult", false]];
  expectFail("flipped disclosed value", flipped, "does not match signed credential");

  const injected = buildProof(nimc, "i_am_adult");
  injected.disclosures = [...injected.disclosures, [randomSalt(), "is_ceo", true]];
  expectFail("injected extra claim", injected, "does not match signed credential");

  const emptied = buildProof(nimc, "i_am_adult");
  emptied.disclosures = [];
  expectFail("disclosing nothing at all", emptied, "do not match the template");

  const partial = buildProof(nimc, "ng_under_26");
  partial.disclosures = partial.disclosures.slice(0, 1);
  expectFail("under-disclosing for the template", partial, "do not match the template");

  const forged = buildProof(nimc, "i_am_adult");
  forged.credential = { ...forged.credential, issuer: "evil.example" };
  expectFail("mutated credential field", forged, "Invalid signature");

  const wrongSigner = buildProof(issue("bank", { bvn_verified: true }), "i_am_verified");
  wrongSigner.credential = { ...wrongSigner.credential, type: "nimc" };
  expectFail("credential re-typed to another issuer", wrongSigner, "Invalid signature");

  expectFail(
    "expired proof",
    buildProof(nimc, "i_am_adult", {}, { expires_at: Math.floor(Date.now() / 1000) - 3600 }),
    "expired"
  );

  const staleCred = issue("nimc", ADULT, { expiresIn: -3600 });
  expectFail("expired credential", buildProof(staleCred, "i_am_adult"), "Credential expired");

  expectFail("unknown template", { ...buildProof(nimc, "i_am_adult"), template: "i_am_king" }, "Unknown proof template");
  expectFail("malformed credential", { ...buildProof(nimc, "i_am_adult"), credential: null }, "Malformed credential");

  // Replay binding.
  expectFail(
    "missing nonce when one was demanded",
    buildProof(nimc, "i_am_adult"),
    "not issued for this request",
    { nonce: "expected-nonce" }
  );
  expectFail(
    "proof aimed at a different verifier",
    buildProof(nimc, "i_am_adult", { nonce: "n1", audience: "other_venue" }),
    "different verifier",
    { nonce: "n1", audience: "this_venue" }
  );

  const bound = verifyProof(
    buildProof(nimc, "i_am_adult", { nonce: "n1", audience: "this_venue" }),
    publicKeys,
    { nonce: "n1", audience: "this_venue" }
  );
  check("correctly bound proof passes", bound.valid, bound.reason);
}

section("Commitment hiding");
{
  // Same claim, two issuances → different commitments, because the salt differs.
  const a = issue("nimc", ADULT);
  const b = issue("nimc", ADULT);
  check(
    "identical claims produce different commitments",
    JSON.stringify(a.credential.claim_hashes) !== JSON.stringify(b.credential.claim_hashes)
  );

  // Without the salt, a verifier cannot confirm a guessed value.
  const guess = hashDisclosure(["", "is_adult", true]);
  check("commitment is not guessable without the salt", !a.credential.claim_hashes.includes(guess));
  check("commitments are sorted", [...a.credential.claim_hashes].sort().join() === a.credential.claim_hashes.join());
}

console.log(`\n${failed === 0 ? "ALL PASSED" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
