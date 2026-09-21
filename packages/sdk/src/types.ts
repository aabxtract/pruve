import type { Proof, TemplateId, VerifyResult } from "@pruve/core";

export interface PruveRequest {
  /** Opaque id you hand back to the wallet. */
  id: string;
  /** Single-use challenge. Binds the proof to this request. */
  nonce: string;
  template: TemplateId;
  /** Your merchant id, echoed by the wallet as the proof's audience. */
  audience: string;
  createdAt: number;
  expiresAt: number;
  /** Deep link for the QR you show the customer. */
  url: string;
  /** Whatever you attached at creation — an order id, a cart, a user row. */
  metadata?: Record<string, unknown>;
  /** Filled in once a proof has been presented against this request. */
  result?: VerifyResult;
  proof?: Proof;
}

export interface VerificationStep {
  label: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface PruveVerification extends VerifyResult {
  /** Step-by-step record of what was checked, with timings. */
  trace: VerificationStep[];
  /** The proof as received, for auditing or display. */
  proof?: Proof;
  request?: PruveRequest;
}

export class PruveError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unknown_template"
      | "unknown_request"
      | "already_answered"
      | "template_mismatch"
      | "keys_unavailable"
      | "invalid_proof"
  ) {
    super(message);
    this.name = "PruveError";
  }
}
