import fs from "node:fs";
import path from "node:path";
import type { PublicKeys } from "@pruve/core";

const CACHE = path.resolve(process.cwd(), ".pubkeys.json");
let keys: PublicKeys | null = null;

/** Trust-on-first-use, then cached on disk. This is what makes offline verification real. */
export async function getPublicKeys(): Promise<PublicKeys> {
  if (keys) return keys;
  try {
    const res = await fetch(`${process.env.ISSUER_URL}/public-keys`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`Issuer responded ${res.status}`);
    keys = (await res.json()) as PublicKeys;
    fs.writeFileSync(CACHE, JSON.stringify(keys));
    console.log("Public keys refreshed from issuer");
  } catch {
    if (!fs.existsSync(CACHE)) {
      throw new Error("Issuer unreachable and no cached public keys. Start the issuer once.");
    }
    keys = JSON.parse(fs.readFileSync(CACHE, "utf-8"));
    console.warn("Issuer unreachable — using cached public keys (this is the offline path)");
  }
  return keys!;
}
