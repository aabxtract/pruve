import fs from "node:fs";
import path from "node:path";
import { generateKeypair, type CredentialType, type KeyPair } from "@pruve/core";

export type IssuerKeys = Record<CredentialType, KeyPair>;

/**
 * Load signing keys, or refuse to start.
 *
 * There is deliberately no fallback to a freshly generated key: a server that
 * silently invents its own identity on boot produces credentials that stop
 * verifying the next time it restarts, and the failure looks like a crypto bug.
 */
const REQUIRED: CredentialType[] = ["nimc", "bank", "card"];

export function loadKeys(): IssuerKeys {
  const fromEnv = process.env.ISSUER_KEYS_JSON;
  if (fromEnv) {
    try {
      return ensureComplete(JSON.parse(fromEnv), null);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("ISSUER_KEYS_JSON is set but is not valid JSON.");
      throw e;
    }
  }

  const file = path.resolve(process.cwd(), ".keys.json");
  if (fs.existsSync(file)) {
    return ensureComplete(JSON.parse(fs.readFileSync(file, "utf-8")), file);
  }

  throw new Error(
    "No issuer keys found. Set ISSUER_KEYS_JSON or run `npm run keys`. " +
      "Refusing to start with generated keys."
  );
}

/**
 * Adds a keypair for any issuer missing from an existing key file.
 *
 * Adding a new issuer type must not force a full key rotation: regenerating
 * nimc or bank would invalidate every credential already sitting in a
 * holder's wallet. Existing keys are never touched.
 */
function ensureComplete(keys: Partial<IssuerKeys>, file: string | null): IssuerKeys {
  const missing = REQUIRED.filter((t) => !keys[t]?.privateKey);
  if (missing.length === 0) return keys as IssuerKeys;

  if (!file) {
    throw new Error(
      `ISSUER_KEYS_JSON is missing keys for: ${missing.join(", ")}. Add them and restart.`
    );
  }

  for (const t of missing) keys[t] = generateKeypair();
  fs.writeFileSync(file, JSON.stringify(keys, null, 2));
  console.log(`Added signing keys for: ${missing.join(", ")} (existing keys untouched)`);
  return keys as IssuerKeys;
}
