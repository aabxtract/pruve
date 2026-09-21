import { DatabaseSync } from "node:sqlite";

// node:sqlite ships with Node itself — no native build step, no prebuild
// download, nothing to compile on the demo laptop or the deploy target.
// The schema is exactly the receipts model from the build guide.
export const db = new DatabaseSync(process.env.DB_PATH ?? "receipts.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    id             TEXT PRIMARY KEY,
    proof_id       TEXT,
    template       TEXT,
    issuer         TEXT,
    result         TEXT NOT NULL,
    reason         TEXT,
    disclosed_keys TEXT,
    verifier_id    TEXT,
    verified_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS used_proofs (
    proof_id TEXT PRIMARY KEY,
    used_at  INTEGER NOT NULL
  );
`);
