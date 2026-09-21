/**
 * Clears the verifier's audit log and single-use registry between takes.
 *
 * Without this, receipts from rehearsals pile up behind your on-camera one,
 * and any proof link you reused in an earlier take is already burned — the
 * replay guard will reject it and the screen goes red for the wrong reason.
 *
 * Does NOT touch issuer keys: rotating those invalidates every credential
 * already sitting in a phone's wallet.
 *
 * Run: npm run demo:reset
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dbPath = path.join(root, "packages/verifier-api/receipts.db");

if (!fs.existsSync(dbPath)) {
  console.log("No receipts.db yet — nothing to reset.");
  process.exit(0);
}

const db = new DatabaseSync(dbPath);

const before = {
  receipts: (db.prepare("SELECT COUNT(*) AS n FROM receipts").get() as { n: number }).n,
  used: (db.prepare("SELECT COUNT(*) AS n FROM used_proofs").get() as { n: number }).n,
};

db.exec("DELETE FROM receipts; DELETE FROM used_proofs;");
db.close();

console.log(`Cleared ${before.receipts} receipt(s) and ${before.used} spent proof(s).`);
console.log("Wallet credentials on the phone are untouched — no need to re-link.");
console.log("\nNote: the verifier API keeps pending requests in memory. If a take");
console.log("went wrong mid-flow, restart it to clear a half-answered request.");
