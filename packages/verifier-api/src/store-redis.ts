import { Redis } from "@upstash/redis";
import type { PublicKeys, VerifyResult } from "@pruve/core";
import type { PendingRequest, ReceiptRow, Store } from "./store.js";

const NS = "pruve:verifier";
const RECEIPT_CAP = 5000;

/** Redis over HTTP (Upstash) — no sockets to hold open, so it suits short-lived functions. */
export class RedisStore implements Store {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async saveRequest(req: PendingRequest) {
    const ttl = Math.max(1, req.expires_at - Math.floor(Date.now() / 1000));
    await this.redis.set(`${NS}:req:${req.id}`, req, { ex: ttl });
  }

  async getRequest(id: string) {
    return (await this.redis.get<PendingRequest>(`${NS}:req:${id}`)) ?? undefined;
  }

  async setRequestResult(id: string, result: VerifyResult) {
    const key = `${NS}:req:${id}`;
    const req = await this.redis.get<PendingRequest>(key);
    if (!req) return;
    // keepTtl: answering a request must not extend how long it stays answerable.
    await this.redis.set(key, { ...req, result }, { keepTtl: true });
  }

  /**
   * SET NX is the whole single-use guarantee: one atomic command, so two
   * instances racing on the same proof cannot both win. No TTL — a proof's
   * expiry is chosen by the holder and is not signed, so letting a spent marker
   * lapse would let it be replayed with a later `expires_at`.
   */
  async claimProof(proofId: string) {
    const res = await this.redis.set(`${NS}:used:${proofId}`, Math.floor(Date.now() / 1000), {
      nx: true,
    });
    return res === "OK";
  }

  async addReceipt(row: ReceiptRow) {
    await this.redis
      .pipeline()
      .lpush(`${NS}:receipts`, row)
      .ltrim(`${NS}:receipts`, 0, RECEIPT_CAP - 1)
      .exec();
  }

  async recentReceipts(limit: number) {
    return this.redis.lrange<ReceiptRow>(`${NS}:receipts`, 0, limit - 1);
  }

  async readPublicKeys() {
    return this.redis.get<PublicKeys>(`${NS}:pubkeys`);
  }

  async writePublicKeys(keys: PublicKeys) {
    await this.redis.set(`${NS}:pubkeys`, keys);
  }
}
