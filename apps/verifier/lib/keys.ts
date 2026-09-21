import type { PublicKeys } from "@pruve/core";

const CACHE = "pruve_pubkeys";

export async function getPublicKeys(): Promise<{ keys: PublicKeys; fresh: boolean }> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_ISSUER_URL}/public-keys`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`Issuer responded ${res.status}`);
    const keys = (await res.json()) as PublicKeys;
    localStorage.setItem(CACHE, JSON.stringify(keys));
    return { keys, fresh: true };
  } catch {
    const cached = localStorage.getItem(CACHE);
    if (!cached) throw new Error("Issuer unreachable and no cached keys on this device");
    return { keys: JSON.parse(cached), fresh: false };
  }
}
