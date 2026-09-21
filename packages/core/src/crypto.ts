import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha256";
import { canonicalize } from "./canonical.js";
import { b64uFromBytes, bytesFromB64u } from "./b64u.js";

// Required by @noble/ed25519 v2 for the synchronous API.
// Note concatBytes: sha512() takes ONE argument, so the tempting
// `(...m) => sha512(...m)` hashes only the first chunk and produces
// signatures that are quietly, consistently wrong.
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

/** A single claim, as held by the wallet: [salt, key, value]. */
export type Disclosure = [salt: string, key: string, value: unknown];

/** 128 bits of salt — enough that a commitment cannot be brute-forced. */
export function randomSalt(): string {
  return b64uFromBytes(ed.etc.randomBytes(16));
}

/**
 * The commitment the issuer signs. Truncated to 128 bits to keep the QR
 * scannable; still far beyond second-preimage reach for this threat model.
 */
export function hashDisclosure(d: Disclosure): string {
  const bytes = sha256(new TextEncoder().encode(canonicalize(d)));
  return b64uFromBytes(bytes.slice(0, 16));
}

export interface KeyPair {
  privateKey: string;
  publicKey: string;
}

export function generateKeypair(): KeyPair {
  const priv = ed.utils.randomPrivateKey();
  return {
    privateKey: b64uFromBytes(priv),
    publicKey: b64uFromBytes(ed.getPublicKey(priv)),
  };
}

export function signPayload(payload: object, privateKeyB64u: string): string {
  const msg = new TextEncoder().encode(canonicalize(payload));
  return b64uFromBytes(ed.sign(msg, bytesFromB64u(privateKeyB64u)));
}

export function verifyPayload(
  sigB64u: string,
  payload: object,
  publicKeyB64u: string
): boolean {
  try {
    const msg = new TextEncoder().encode(canonicalize(payload));
    return ed.verify(bytesFromB64u(sigB64u), msg, bytesFromB64u(publicKeyB64u));
  } catch {
    return false;
  }
}
