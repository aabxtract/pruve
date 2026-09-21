import {
  TEMPLATES,
  TEMPLATE_LIST,
  stringFromB64u,
  verifyProof,
  type Proof,
  type PublicKeys,
  type TemplateId,
} from "@pruve/core";
import { randomUUID } from "node:crypto";
import {
  MemoryKeyCache,
  MemoryReplayStore,
  MemoryRequestStore,
  type KeyCache,
  type ReplayStore,
  type RequestStore,
} from "./stores.js";
import { PruveError, type PruveRequest, type PruveVerification, type VerificationStep } from "./types.js";

export interface PruveVerifierOptions {
  /** Where to fetch issuer public keys. Contacted once, then cached. */
  issuerUrl: string;
  /** Identifies you in the proof's audience binding. */
  verifierId: string;
  /** Base URL of the wallet, used to build the QR deep link. */
  walletUrl?: string;
  /**
   * The URL the WALLET should post proofs back to — your own endpoint.
   * Differs from your internal URL whenever the customer's phone cannot
   * reach the host your service runs on.
   */
  callbackUrl?: string;
  /** Request lifetime in seconds. Default 600. */
  requestTtl?: number;
  /** How long a spent proof stays spent. Default 86400. */
  replayTtl?: number;
  /** Key cache refresh interval in seconds. Default 3600. */
  keyTtl?: number;
  requestStore?: RequestStore;
  replayStore?: ReplayStore;
  keyCache?: KeyCache;
  fetch?: typeof globalThis.fetch;
}

/**
 * Verify Pruve proofs inside your own service.
 *
 * Everything here runs in your process. The only outbound call this class ever
 * makes is fetching the issuer's public keys, which happens once and is then
 * cached — after that, verification is pure local computation. Pruve is not in
 * your request path and cannot observe your customers.
 *
 *   const pruve = new PruveVerifier({
 *     issuerUrl: "https://issuer.pruve.ng",
 *     verifierId: "campus_store",
 *     walletUrl: "https://wallet.pruve.ng",
 *     callbackUrl: "https://campusstore.ng/api/pruve",
 *   });
 *
 *   const request = await pruve.createRequest("ng_under_26");
 *   // show request.url as a QR, then:
 *   const result = await pruve.verifyPresentation(request.id, proof);
 */
export class PruveVerifier {
  private readonly opts: Required<
    Omit<PruveVerifierOptions, "requestStore" | "replayStore" | "keyCache" | "fetch" | "walletUrl" | "callbackUrl">
  > & Pick<PruveVerifierOptions, "walletUrl" | "callbackUrl">;

  private readonly requests: RequestStore;
  private readonly replays: ReplayStore;
  private readonly keys: KeyCache;
  private readonly doFetch: typeof globalThis.fetch;
  private keysFetchedAt = 0;

  constructor(options: PruveVerifierOptions) {
    if (!options.issuerUrl) throw new Error("PruveVerifier: issuerUrl is required");
    if (!options.verifierId) throw new Error("PruveVerifier: verifierId is required");

    this.opts = {
      issuerUrl: options.issuerUrl.replace(/\/$/, ""),
      verifierId: options.verifierId,
      walletUrl: options.walletUrl?.replace(/\/$/, ""),
      callbackUrl: options.callbackUrl?.replace(/\/$/, ""),
      requestTtl: options.requestTtl ?? 600,
      replayTtl: options.replayTtl ?? 86_400,
      keyTtl: options.keyTtl ?? 3_600,
    };

    this.requests = options.requestStore ?? new MemoryRequestStore();
    this.replays = options.replayStore ?? new MemoryReplayStore();
    this.keys = options.keyCache ?? new MemoryKeyCache();
    this.doFetch = options.fetch ?? globalThis.fetch;
  }

  /** The facts a wallet can prove, for building your own UI. */
  static templates() {
    return TEMPLATE_LIST.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      credentialType: t.credentialType,
      reveals: t.reveals,
      hides: t.hides,
    }));
  }

  /**
   * Issuer public keys, cached.
   *
   * On a refresh failure with keys already cached, the cached copy is returned
   * rather than throwing: an issuer outage must not take a merchant down.
   */
  async publicKeys(): Promise<PublicKeys> {
    const cached = await this.keys.read();
    if (cached && Date.now() - this.keysFetchedAt < this.opts.keyTtl * 1000) return cached;

    try {
      const res = await this.doFetch(`${this.opts.issuerUrl}/public-keys`, {
        signal: AbortSignal.timeout(5000),
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (!res.ok) throw new Error(`issuer responded ${res.status}`);
      const fresh = (await res.json()) as PublicKeys;
      await this.keys.write(fresh);
      this.keysFetchedAt = Date.now();
      return fresh;
    } catch (err) {
      if (cached) return cached;
      throw new PruveError(
        `Could not fetch issuer public keys and none are cached: ${String(err)}`,
        "keys_unavailable"
      );
    }
  }

  /** Ask a customer to prove one fact. Show `request.url` as a QR. */
  async createRequest(
    template: TemplateId,
    metadata?: Record<string, unknown>
  ): Promise<PruveRequest> {
    if (!TEMPLATES[template]) {
      throw new PruveError(`Unknown template: ${template}`, "unknown_template");
    }

    const now = Math.floor(Date.now() / 1000);
    const id = `req_${randomUUID().slice(0, 16)}`;
    const nonce = randomUUID();

    const req: PruveRequest = {
      id,
      nonce,
      template,
      audience: this.opts.verifierId,
      createdAt: now,
      expiresAt: now + this.opts.requestTtl,
      url: this.buildUrl(id, nonce, template),
      metadata,
    };

    await this.requests.save(req);
    return req;
  }

  private buildUrl(id: string, nonce: string, template: TemplateId): string {
    if (!this.opts.walletUrl) return "";
    const q = new URLSearchParams({
      template,
      rid: id,
      nonce,
      aud: this.opts.verifierId,
    });
    if (this.opts.callbackUrl) q.set("api", this.opts.callbackUrl);
    return `${this.opts.walletUrl}/share?${q.toString()}`;
  }

  async getRequest(id: string): Promise<PruveRequest | undefined> {
    return this.requests.get(id);
  }

  /**
   * Verify a proof presented against a request you created.
   *
   * This is the path with replay protection: the nonce ties the proof to this
   * one request, and the proof id is spent on success.
   */
  async verifyPresentation(requestId: string, proof: Proof): Promise<PruveVerification> {
    const req = await this.requests.get(requestId);
    if (!req) throw new PruveError("No such request, or it expired", "unknown_request");
    if (req.result) throw new PruveError("This request was already answered", "already_answered");
    if (proof?.template !== req.template) {
      throw new PruveError(
        `Request asked for ${req.template}, proof is ${proof?.template}`,
        "template_mismatch"
      );
    }

    const out = await this.run(proof, { nonce: req.nonce, audience: req.audience });
    req.result = out;
    req.proof = proof;
    await this.requests.save(req);
    return { ...out, request: req };
  }

  /**
   * Verify a standalone proof — a shared link, with no request behind it.
   *
   * There is no nonce to bind, so within its validity window this proof is a
   * bearer token: anyone holding it can present it. Replay protection still
   * applies. Prefer `createRequest` + `verifyPresentation` for anything where
   * that matters.
   */
  async verify(proof: Proof): Promise<PruveVerification> {
    return this.run(proof, {});
  }

  /** Decode a `?proof=` query parameter from a shared link. */
  static decodeProof(encoded: string): Proof {
    try {
      return JSON.parse(stringFromB64u(encoded)) as Proof;
    } catch {
      throw new PruveError("Proof parameter is not readable", "invalid_proof");
    }
  }

  private async run(
    proof: Proof,
    expect: { nonce?: string; audience?: string }
  ): Promise<PruveVerification> {
    const trace: VerificationStep[] = [];
    const timed = async <T,>(label: string, fn: () => T | Promise<T>, describe: (v: T) => string) => {
      const t0 = performance.now();
      const value = await fn();
      trace.push({ label, ok: true, detail: describe(value), ms: +(performance.now() - t0).toFixed(2) });
      return value;
    };

    const keys = await timed(
      "Load issuer public keys",
      () => this.publicKeys(),
      (k) => `${Object.keys(k).length} issuers (cached locally)`
    );

    await timed(
      "Read proof",
      () => proof,
      (p) =>
        `${p?.credential?.claim_hashes?.length ?? 0} commitments, ${p?.disclosures?.length ?? 0} disclosed`
    );

    const t0 = performance.now();
    const result = verifyProof(proof, keys, expect);
    trace.push({
      label: "verifyProof() — in this process",
      ok: result.valid,
      detail: result.valid
        ? `signature + ${proof.disclosures.length} commitment check(s) passed`
        : (result.reason ?? "rejected"),
      ms: +(performance.now() - t0).toFixed(2),
    });

    if (!result.valid) return { ...result, trace, proof };

    const t1 = performance.now();
    const fresh = await this.replays.claim(proof.proof_id, this.opts.replayTtl);
    trace.push({
      label: "Single-use check",
      ok: fresh,
      detail: fresh ? "first redemption of this proof" : "this proof was already redeemed",
      ms: +(performance.now() - t1).toFixed(2),
    });

    if (!fresh) {
      return { valid: false, reason: "Proof has already been used", trace, proof };
    }

    return {
      ...result,
      receipt_id: `rcpt_${randomUUID().slice(0, 12)}`,
      trace,
      proof,
    };
  }
}
