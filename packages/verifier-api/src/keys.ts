import type { PublicKeys } from "@pruve/core";
import { store } from "./store.js";

let keys: PublicKeys | null = null;

/** Trust-on-first-use, then cached in the store. This is what makes offline verification real. */
export async function getPublicKeys(): Promise<PublicKeys> {
  if (keys) return keys;

  let fetched: PublicKeys | null = null;
  try {
    const res = await fetch(`${process.env.ISSUER_URL}/public-keys`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`Issuer responded ${res.status}`);
    fetched = (await res.json()) as PublicKeys;
  } catch {
    // fall through to the cache
  }

  if (fetched) {
    keys = fetched;
    // Best effort: failing to persist the cache must not fail a verification
    // that already has the keys it needs.
    await store.writePublicKeys(fetched).catch((e) => console.warn("Could not cache public keys:", e));
    console.log("Public keys refreshed from issuer");
    return keys;
  }

  const cached = await store.readPublicKeys();
  if (!cached) {
    throw new Error("Issuer unreachable and no cached public keys. Start the issuer once.");
  }
  keys = cached;
  console.warn("Issuer unreachable — using cached public keys (this is the offline path)");
  return keys;
}
