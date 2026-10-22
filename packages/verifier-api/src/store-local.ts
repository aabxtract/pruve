import fs from "node:fs";
import path from "node:path";
import type { PublicKeys, VerifyResult } from "@pruve/core";
import type { PendingRequest, ReceiptRow, Store } from "./store.js";

const PUBKEY_CACHE = path.resolve(process.cwd(), ".pubkeys.json");

/** Single-process store: sqlite for the durable parts, a Map for pending requests. */
export class LocalStore implements Store {
  private readonly db: import("node:sqlite").DatabaseSync;
  private readonly requests = new Map<string, PendingRequest>();

  constructor(file: string) {
    // node:sqlite ships with Node itself — no native build step, no prebuild
    // download, nothing to compile on the demo laptop. It is fetched with
    // getBuiltinModule rather than imported so a bundler targeting a deploy
    // platform never has to resolve it, and so it is never loaded at all
    // where this class is not constructed.
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
    this.db = new DatabaseSync(file);
    this.db.exec(`
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
  }

  async saveRequest(req: PendingRequest) {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, r] of this.requests) if (r.expires_at < now) this.requests.delete(id);
    this.requests.set(req.id, req);
  }

  async getRequest(id: string) {
    const req = this.requests.get(id);
    if (req && req.expires_at < Math.floor(Date.now() / 1000)) {
      this.requests.delete(id);
      return undefined;
    }
    return req;
  }

  async setRequestResult(id: string, result: VerifyResult) {
    const req = this.requests.get(id);
    if (req) req.result = result;
  }

  async claimProof(proofId: string) {
    const { changes } = this.db
      .prepare(`INSERT OR IGNORE INTO used_proofs (proof_id, used_at) VALUES (?, ?)`)
      .run(proofId, Math.floor(Date.now() / 1000));
    return Number(changes) === 1;
  }

  async addReceipt(r: ReceiptRow) {
    this.db
      .prepare(
        `INSERT INTO receipts
           (id, proof_id, template, issuer, result, reason, disclosed_keys, verifier_id, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        r.id,
        r.proof_id,
        r.template,
        r.issuer,
        r.result,
        r.reason,
        r.disclosed_keys,
        r.verifier_id,
        r.verified_at
      );
  }

  async recentReceipts(limit: number) {
    return this.db
      .prepare(`SELECT * FROM receipts ORDER BY verified_at DESC LIMIT ?`)
      .all(limit) as unknown as ReceiptRow[];
  }

  async readPublicKeys() {
    if (!fs.existsSync(PUBKEY_CACHE)) return null;
    return JSON.parse(fs.readFileSync(PUBKEY_CACHE, "utf-8")) as PublicKeys;
  }

  async writePublicKeys(keys: PublicKeys) {
    fs.writeFileSync(PUBKEY_CACHE, JSON.stringify(keys));
  }
}
