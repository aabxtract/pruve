import type { PublicKeys } from "@pruve/core";
import type { PruveRequest } from "./types.js";

/**
 * Storage is pluggable because the defaults below are process-local.
 *
 * An in-memory store is correct for a single process and wrong the moment a
 * merchant runs two. Requests would be invisible to the instance that did not
 * create them, and — more seriously — the single-use registry would stop
 * being single-use, because each instance would keep its own idea of which
 * proofs had been spent. Any merchant running more than one node should pass
 * a Redis- or SQL-backed implementation of these two interfaces.
 */

export interface RequestStore {
  save(req: PruveRequest): Promise<void> | void;
  get(id: string): Promise<PruveRequest | undefined> | PruveRequest | undefined;
  delete(id: string): Promise<void> | void;
}

export interface ReplayStore {
  /** Returns true if this proof had NOT been seen before (i.e. claim succeeded). */
  claim(proofId: string, ttlSeconds: number): Promise<boolean> | boolean;
}

export class MemoryRequestStore implements RequestStore {
  private readonly map = new Map<string, PruveRequest>();

  save(req: PruveRequest) {
    this.map.set(req.id, req);
    this.sweep();
  }

  get(id: string) {
    const r = this.map.get(id);
    if (r && r.expiresAt * 1000 < Date.now()) {
      this.map.delete(id);
      return undefined;
    }
    return r;
  }

  delete(id: string) {
    this.map.delete(id);
  }

  private sweep() {
    const now = Date.now();
    for (const [id, r] of this.map) if (r.expiresAt * 1000 < now) this.map.delete(id);
  }
}

export class MemoryReplayStore implements ReplayStore {
  private readonly seen = new Map<string, number>();

  claim(proofId: string, ttlSeconds: number) {
    const now = Date.now();
    for (const [id, exp] of this.seen) if (exp < now) this.seen.delete(id);
    if (this.seen.has(proofId)) return false;
    this.seen.set(proofId, now + ttlSeconds * 1000);
    return true;
  }
}

/**
 * Public keys, fetched once then cached.
 *
 * The cache is what makes verification survive the issuer being unreachable:
 * a merchant that has fetched keys once keeps trading through an issuer
 * outage. `onDisk` lets a caller persist them across restarts.
 */
export interface KeyCache {
  read(): Promise<PublicKeys | null> | PublicKeys | null;
  write(keys: PublicKeys): Promise<void> | void;
}

export class MemoryKeyCache implements KeyCache {
  private keys: PublicKeys | null = null;
  read() {
    return this.keys;
  }
  write(keys: PublicKeys) {
    this.keys = keys;
  }
}
