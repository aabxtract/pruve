/**
 * Side-effect module: populates process.env before any other module is
 * evaluated. Imported first in index.ts.
 *
 * This has to be an import rather than a plain loadEnv() call in index.ts,
 * because ESM hoists every `import` and evaluates dependencies in declaration
 * order — a statement in the module body runs *after* all of them, which is
 * too late for db.ts (DB_PATH) and keys.ts (ISSUER_URL).
 */
import { loadEnv } from "./env.js";

loadEnv();
