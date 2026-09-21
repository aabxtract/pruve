import type { Disclosure } from "./crypto.js";

export type CredentialType = "nimc" | "bank" | "card";

/**
 * What the issuer signs. Contains commitments only — never a claim value.
 * This object is what travels inside every proof, so anything added here
 * becomes public to the verifier.
 */
export interface SignedCredential {
  id: string;
  type: CredentialType;
  issuer: string;
  issued_at: number;
  expires_at: number;
  /** Sorted, so ordering leaks nothing about which claim is which. */
  claim_hashes: string[];
  signature: string;
}

/** What the wallet stores. `disclosures` never leaves the device wholesale. */
export interface WalletCredential {
  credential: SignedCredential;
  disclosures: Disclosure[];
}

export type TemplateId =
  | "i_am_adult"
  | "ng_under_26"
  | "i_earn_enough"
  | "i_am_verified"
  | "card_active"
  | "card_premium";

export interface Proof {
  proof_id: string;
  template: TemplateId;
  credential: SignedCredential;
  /** ONLY the claims this template calls for. */
  disclosures: Disclosure[];
  /** Binds the proof to one verifier request. Absent in the link flow. */
  nonce?: string;
  audience?: string;
  generated_at: number;
  expires_at: number;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  template?: TemplateId;
  disclosed?: Record<string, unknown>;
  issuer?: string;
  receipt_id?: string;
  verified_at?: string;
  /** false when the verifier API was unreachable and we fell back to a local check. */
  logged?: boolean;
}

export type PublicKeys = Record<CredentialType, string>;
