import type { PublicKeys, TemplateId, VerifyResult } from "@pruve/core";
import { LocalStore } from "./store-local.js";
import { RedisStore } from "./store-redis.js";

export type PendingRequest = {
  id: string;
  template: TemplateId;
  nonce: string;
  verifier_id: string;
  expires_at: number;
  result?: VerifyResult;
};

export interface ReceiptRow {
  id: string;
  proof_id: string | null;
  template: string | null;
  issuer: string | null;
  result: "valid" | "invalid";
  reason: string | null;
  disclosed_keys: string;
  verifier_id: string;
  verified_at: number;
}

/**
 * Everything the verifier API needs to remember between requests.
 *
 * One interface, two homes. A long-lived Node process can hold this in memory
 * and a sqlite file; a serverless function cannot — instances share neither, so
 * the single-use registry would silently stop being single-use. Hence the
 * Redis implementation, which is what runs on Vercel.
 */
export interface Store {
  saveRequest(req: PendingRequest): Promise<void>;
  getRequest(id: string): Promise<PendingRequest | undefined>;
  /** Records the outcome without extending the request's lifetime. */
  setRequestResult(id: string, result: VerifyResult): Promise<void>;

  /** Atomically marks a proof spent. Returns false if it was already spent. */
  claimProof(proofId: string): Promise<boolean>;

  addReceipt(row: ReceiptRow): Promise<void>;
  recentReceipts(limit: number): Promise<ReceiptRow[]>;

  /** Issuer public keys, trust-on-first-use. What keeps verification alive with the issuer down. */
  readPublicKeys(): Promise<PublicKeys | null>;
  writePublicKeys(keys: PublicKeys): Promise<void>;
}

/**
 * Picks the store from the environment, or refuses to start.
 *
 * On Vercel there is deliberately no fallback to the local store: a function
 * that quietly kept receipts and spent proofs in its own memory would pass
 * every single-instance test and then let a proof be replayed against another
 * instance.
 */
export function createStore(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (url && token) return new RedisStore(url, token);

  if (process.env.VERCEL) {
    throw new Error(
      "No Redis configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN " +
        "(or KV_REST_API_URL / KV_REST_API_TOKEN). Refusing to start with process-local state."
    );
  }
  return new LocalStore(process.env.DB_PATH ?? "receipts.db");
}

export const store: Store = createStore();
