import { hashDisclosure, verifyPayload } from "./crypto.js";
import { TEMPLATES } from "./templates.js";
import type { Proof, PublicKeys, VerifyResult } from "./types.js";

const CLOCK_SKEW = 60; // seconds

/**
 * The single verification path. Used by the verifier's browser AND its API,
 * so the two can never disagree about what a valid proof is.
 *
 * Deliberately pure and synchronous: no network, no clock authority beyond
 * Date.now(), no issuer contact. That is what lets verification keep working
 * when the issuer is switched off.
 */
export function verifyProof(
  proof: Proof,
  publicKeys: PublicKeys,
  expect?: { nonce?: string; audience?: string }
): VerifyResult {
  const now = Math.floor(Date.now() / 1000);

  const template = TEMPLATES[proof?.template];
  if (!template) return { valid: false, reason: "Unknown proof template" };

  // 1. Freshness — checked here, not in the presenter's browser.
  if (
    typeof proof.expires_at !== "number" ||
    proof.expires_at + CLOCK_SKEW < now
  ) {
    return { valid: false, reason: "Proof has expired" };
  }

  const cred = proof.credential;
  if (!cred || !Array.isArray(cred.claim_hashes)) {
    return { valid: false, reason: "Malformed credential" };
  }
  if (typeof cred.expires_at !== "number" || cred.expires_at + CLOCK_SKEW < now) {
    return { valid: false, reason: "Credential expired" };
  }

  // 2. Issuer signature over the commitment set.
  const pub = publicKeys?.[cred.type];
  if (!pub) return { valid: false, reason: `Unknown issuer type: ${cred.type}` };

  const { signature, ...unsigned } = cred;
  if (!verifyPayload(signature, unsigned, pub)) {
    return { valid: false, reason: "Invalid signature" };
  }

  // 3. Every disclosed triple must hash into the signed set.
  const signedSet = new Set(cred.claim_hashes);
  const disclosed: Record<string, unknown> = {};
  for (const d of proof.disclosures ?? []) {
    if (!Array.isArray(d) || d.length !== 3) {
      return { valid: false, reason: "Malformed disclosure" };
    }
    if (!signedSet.has(hashDisclosure(d))) {
      return { valid: false, reason: "Disclosure does not match signed credential" };
    }
    const [, key, value] = d;
    if (typeof key !== "string") {
      return { valid: false, reason: "Malformed disclosure" };
    }
    if (Object.prototype.hasOwnProperty.call(disclosed, key)) {
      return { valid: false, reason: "Duplicate disclosed claim" };
    }
    disclosed[key] = value;
  }

  // 4. The disclosure set must be exactly what the template calls for.
  //    Without this, a holder discloses nothing and still looks like a pass.
  const got = Object.keys(disclosed).sort().join(",");
  const want = [...template.reveals].sort().join(",");
  if (got !== want) {
    return { valid: false, reason: "Disclosed claims do not match the template" };
  }

  // 5. The values must satisfy the claim being made.
  if (!template.satisfied(disclosed)) {
    return { valid: false, reason: `Does not meet the requirement: ${template.label}` };
  }

  // 6. Replay binding, when the verifier issued a request.
  if (expect?.nonce && proof.nonce !== expect.nonce) {
    return { valid: false, reason: "Proof was not issued for this request" };
  }
  if (expect?.audience && proof.audience !== expect.audience) {
    return { valid: false, reason: "Proof was issued for a different verifier" };
  }

  return {
    valid: true,
    template: proof.template,
    disclosed,
    issuer: cred.issuer,
    verified_at: new Date().toISOString(),
  };
}
