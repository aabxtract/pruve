import type { Person } from "./registry.js";

/**
 * Claim derivation from a registry record.
 *
 * Each issuer emits only what it can actually attest. The card issuer never
 * emits a card number, an expiry or a CVV — not because they are filtered out
 * downstream, but because they are never made into claims, so there is no
 * commitment for them and no way to disclose them.
 */

export function ageBand(age: number): string {
  if (age < 18) return "under_18";
  if (age <= 25) return "18-25";
  if (age <= 35) return "26-35";
  if (age <= 50) return "36-50";
  return "51+";
}

export function nimcClaims(p: Person): Record<string, unknown> {
  return {
    is_adult: p.age >= 18,
    age_band: ageBand(p.age),
    nationality: "NG",
  };
}

export function bankClaims(p: Person): Record<string, unknown> {
  return {
    account_status: p.account_status,
    bvn_verified: p.bvn_verified,
    // Thresholds, not the figure. "I earn enough" then discloses one boolean
    // rather than telling the verifier which bracket the holder sits in.
    income_at_least_100k: p.monthly_income >= 100_000,
    income_at_least_500k: p.monthly_income >= 500_000,
  };
}

export function cardClaims(p: Person): Record<string, unknown> {
  return {
    card_active: p.card_active,
    card_is_premium: p.card_tier !== "classic",
    issuing_bank: p.bank,
  };
}
