import fs from "node:fs";
import path from "node:path";

/**
 * Load .env into process.env.
 *
 * Neither tsx nor node loads a .env file on its own, so without this the
 * committed `.env` is dead config: ISSUER_URL comes back undefined, the key
 * fetch requests "undefined/public-keys", and the service survives only
 * because a stale .pubkeys.json happens to be on disk. On a fresh clone it
 * cannot bootstrap at all.
 *
 * Real environment variables always win, so a deployed PORT/ISSUER_URL is
 * never clobbered by a checked-in file.
 */
export function loadEnv(file = ".env"): void {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;

  for (const raw of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
