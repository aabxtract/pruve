import type { PublicKeys } from "@pruve/core";
import { api } from "./http";

const CACHE = "pruve_pubkeys";

/**
 * Trust-on-first-use, then cached in the browser.
 *
 * This is what makes offline verification real: once a device has seen the
 * issuer's public keys, it can check any proof without the issuer being
 * reachable at all.
 */
export async function getPublicKeys(): Promise<{ keys: PublicKeys; fresh: boolean }> {
  try {
    const res = await api(`${process.env.NEXT_PUBLIC_ISSUER_URL}/public-keys`, {
      signal: AbortSignal.timeout(5000),
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
