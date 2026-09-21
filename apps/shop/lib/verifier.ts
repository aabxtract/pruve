import { PruveVerifier } from "@pruve/sdk";

/**
 * Campus Store's Pruve integration — the whole thing.
 *
 * This file is deliberately this short. The store installs @pruve/sdk,
 * constructs one object, and verification happens inside its own Node
 * process. No Pruve endpoint is called at request time, so Pruve cannot
 * observe who shopped here or what they proved.
 */

const g = globalThis as typeof globalThis & { __pruve?: PruveVerifier };

/**
 * Pinned to globalThis because Next re-instantiates modules when it compiles
 * a route on first request in dev — a plain module-level instance would lose
 * every pending request and, worse, reset the single-use registry.
 */
export const pruve: PruveVerifier = (g.__pruve ??= new PruveVerifier({
  issuerUrl: process.env.ISSUER_ORIGIN ?? "http://localhost:3001",
  verifierId: "campus_store",
  walletUrl: process.env.NEXT_PUBLIC_HOLDER_URL ?? "http://localhost:3000",
  // Where the customer's phone posts the proof. Not the same as our internal
  // origin whenever the phone cannot reach the host we run on.
  callbackUrl: process.env.NEXT_PUBLIC_SHOP_API_PUBLIC_URL || undefined,
}));
