/**
 * @pruve/sdk — verify Pruve proofs inside your own service.
 *
 * The whole point of this package is what it does NOT do: it never sends a
 * proof, a customer identifier, or a verification event to Pruve. Issuer
 * public keys are fetched once and cached; everything after that is local
 * computation. You do not have to trust us with your traffic, because we are
 * structurally unable to see it.
 */
export { PruveVerifier, type PruveVerifierOptions } from "./verifier.js";
export {
  PruveError,
  type PruveRequest,
  type PruveVerification,
  type VerificationStep,
} from "./types.js";
export {
  MemoryKeyCache,
  MemoryReplayStore,
  MemoryRequestStore,
  type KeyCache,
  type ReplayStore,
  type RequestStore,
} from "./stores.js";

// Re-exported so integrators need only one dependency.
export {
  TEMPLATES,
  TEMPLATE_LIST,
  verifyProof,
  stringFromB64u,
  b64uFromString,
  type CredentialType,
  type Proof,
  type PublicKeys,
  type Template,
  type TemplateId,
  type VerifyResult,
} from "@pruve/core";
