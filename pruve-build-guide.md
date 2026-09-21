# Pruve — Build Guide (v2)

**Track B · ICSC 2026 Hackathon**
Two-sided credential wallet. Holder proves one fact. Verifier confirms it locally. The issuer never learns that the check happened.

> **Honest tagline:** *No identifiers, no document numbers, no database lookups.*
> (Not "zero PII" — `age_band` and `nationality` are personal data. Say the precise thing; in a privacy pitch precision is the product.)

---

## Architecture

```
                    ┌──────────────────────┐
                    │     ISSUER API       │
                    │  (Hono · :3001)      │
                    │  Mock NIMC + Bank    │
                    │  Signs commitments   │
                    └──────────┬───────────┘
                               │
                 issuance      │      GET /public-keys
                 (once)        │      (cached, then offline)
                               │
       ┌───────────────────────┼────────────────────────┐
       ▼                                                ▼
┌──────────────────┐                        ┌───────────────────────┐
│   HOLDER APP     │   presents proof       │   VERIFIER WEB        │
│  (Next · :3000)  │ ─────────────────────▶ │   (Next · :3002)      │
│  Mobile PWA      │                        │   No app install      │
│  Wallet + salts  │                        └───────────┬───────────┘
└──────────────────┘                                    │
                                                        ▼
                                            ┌───────────────────────┐
                                            │   VERIFIER API        │
                                            │   (Hono · :3003)      │
                                            │   Re-verify + receipt │
                                            │   Single-use registry │
                                            └───────────────────────┘
```

**The issuer is not in the verification path.** That is the whole point. It signs once, publishes public keys, and is never told who verified what. Verification is an Ed25519 check the verifier does itself against a cached key — it works with the issuer server switched off.

**Shared code lives in `packages/core`** and is imported by all four services, so the signing, hashing and canonicalisation logic cannot drift between issuer and verifier.

### Credential model — salted claim commitments

The issuer does **not** sign the claim values. It signs a sorted array of hashes:

```
hash = sha256( canonical([ salt, key, value ]) )[0..16]
```

The holder keeps `(salt, key, value)` triples privately. To prove one fact, it sends the signed credential plus **only the triples it chose to reveal**. The verifier recomputes each hash and checks membership in the signed array.

Undisclosed claims are hashes of unknown 128-bit salts. They are not readable, not guessable, and not recoverable from the QR. The claim *names* are inside the hash too, so an undisclosed claim leaks nothing but its existence.

This is the SD-JWT disclosure model. It is ~60 lines and it is what makes "only chosen fields leave the device" a true statement instead of a label.

---

## Credentials and templates

**`nimc`** — `is_adult`, `age_band`, `nationality`
**`bank`** — `account_status`, `bvn_verified`, `income_at_least_100k`, `income_at_least_500k`

Income is issued as **threshold booleans**, not a band. "I earn enough" then reveals a single `true` instead of telling the landlord which bracket you are in. Same machinery, strictly less disclosure.

| Template | Credential | Reveals | Passes when |
|---|---|---|---|
| I am an adult | NIMC | `is_adult` | `is_adult === true` |
| Nigerian, under 26 | NIMC | `is_adult`, `age_band`, `nationality` | `age_band === "18-25"` and `nationality === "NG"` |
| I earn ₦100k+ | Bank | `account_status`, `income_at_least_100k` | both true/active |
| I am bank verified | Bank | `bvn_verified` | `bvn_verified === true` |

> The old "I am a student" template is gone. NIMC cannot prove enrolment, and a judge will say so. "Nigerian, under 26" is the same discount-eligibility use case and is actually provable from the credential.

---

## Build order

```
Day 1 → packages/core + issuer API + TUNNELS/DEPLOY (get HTTPS working today)
Day 2 → Holder app (onboard, wallet, present)
Day 3 → Verifier web + verifier API + receipts
Day 4 → Demo scripts, failure cases, polish
```

Deployment moves to Day 1. It is not polish. A demo that has never run in its demo configuration is not a demo.

---

## Pre-flight (20 mins)

> **Node 22 or newer is required.** The verifier API stores receipts through
> `node:sqlite`, which ships inside Node itself. Built on Node 24.

```bash
mkdir pruve && cd pruve
git init
mkdir -p apps packages scripts/githooks
```

**Root `package.json`** — npm workspaces, so `@pruve/core` actually resolves:

```json
{
  "name": "pruve",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "concurrently -n issuer,verifier-api,holder,verifier -c blue,magenta,green,yellow \"npm -w @pruve/issuer-api run dev\" \"npm -w @pruve/verifier-api run dev\" \"npm -w holder run dev\" \"npm -w verifier run dev\"",
    "keys": "npm -w @pruve/issuer-api run keys",
    "typecheck": "tsc -b --force packages/core packages/issuer-api packages/verifier-api",
    "test": "tsx scripts/core.test.ts",
    "smoke": "tsx scripts/smoke.ts",
    "test:offline": "tsx scripts/offline.test.ts",
    "verify:all": "npm run typecheck && npm test && npm run smoke && npm run test:offline",
    "icons": "tsx scripts/gen-icons.ts",
    "qr-size": "tsx scripts/qr-size.ts",
    "hooks:install": "git config core.hooksPath scripts/githooks"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "concurrently": "^9.1.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

**`.gitignore`:**

```
node_modules/
.next/
out/
dist/
*.tsbuildinfo

# Secrets — never commit
.keys.json
.env
.env*.local

# Local caches / state
.pubkeys.json
*.db
*.db-journal
```

Then scaffold:

```bash
mkdir -p packages/core/src
mkdir -p packages/issuer-api/src packages/issuer-api/scripts
mkdir -p packages/verifier-api/src
mkdir -p apps/holder/app apps/holder/lib apps/holder/public
mkdir -p apps/verifier/app apps/verifier/lib apps/verifier/components apps/verifier/public
```

**Write the two Next apps by hand rather than running `create-next-app`.** Inside
a workspace it triggers its own install, prompts interactively, and hands you a
default layout you are about to replace anyway. Each app needs only a
`package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`,
`tailwind.config.ts`, and `app/{layout.tsx,globals.css}`.

```json
// apps/holder/package.json  (apps/verifier is identical but for name + ports)
{
  "name": "holder",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000"
  },
  "dependencies": {
    "@pruve/core": "*",
    "next": "^14.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-qr-code": "^2.0.15"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.7.2"
  }
}
```

```typescript
// apps/holder/tailwind.config.ts  (same in apps/verifier)
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

Then one install from the root:

```bash
npm install
```

**Pinned dependencies.** Do not use `@latest` on the crypto libs — `@noble/ed25519` v3 renamed `randomPrivateKey`, and `@noble/hashes` v2 moved `sha512` to a different path. Both changes will silently break this guide.

```json
// packages/core/package.json
"dependencies": {
  "@noble/ed25519": "^2.1.0",
  "@noble/hashes": "^1.4.0"
}
```

> `@noble/hashes` is a **direct dependency**, not transitive — `@noble/ed25519` v2 ships zero dependencies. v1 of this guide omitted it and Step 1 died on the first run.

**Two libraries this build deliberately does not use:**

*No SQLite package.* `node:sqlite` is built into Node 22+. `better-sqlite3` is a
native module: it needs a prebuild download or a compiler, and it is the single
most likely thing to fail on a teammate's laptop or a fresh deploy container at
the worst possible moment.

*No QR scanner.* The verifier displays a QR; the holder scans it with the
**native phone camera**, which opens a deep link into the wallet. That removes
`getUserMedia`, the secure-context camera restriction, a permission prompt, and
the flakiest part of demo day — a laptop webcam trying to focus on a phone screen.

---

## Pre-commit guard

Committed to the repo so teammates get it too — `.git/hooks` is local-only and would have protected nobody.

```bash
mkdir -p scripts/githooks
cat > scripts/githooks/pre-commit << 'EOF'
#!/bin/sh
if git diff --cached --name-only | grep -qE '(^|/)\.keys\.json$'; then
  echo "ERROR: .keys.json is staged. Aborting."; exit 1
fi
if git diff --cached -U0 | grep -qE '^\+.*(privateKey|SECRET_KEY|PRIVATE_KEY)"?\s*[:=]\s*"?[A-Za-z0-9_-]{40,}'; then
  echo "ERROR: Possible private key in staged diff. Aborting."; exit 1
fi
exit 0
EOF
chmod +x scripts/githooks/pre-commit
npm run hooks:install
```

---

## Step 0 — `packages/core`

Everything cryptographic lives here once.

**`packages/core/package.json`**

```json
{
  "name": "@pruve/core",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@noble/ed25519": "^2.1.0",
    "@noble/hashes": "^1.4.0"
  }
}
```

### 0.1 Canonical JSON

Key order must be deterministic or signatures break the moment a payload round-trips through `JSON.parse`. v1 relied on V8 preserving insertion order — true in practice, but a landmine you will step on at the worst moment.

```typescript
// packages/core/src/canonical.ts
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}
```

### 0.2 base64url

```typescript
// packages/core/src/b64u.ts
export function b64uFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function bytesFromB64u(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const b64uFromString = (s: string) => b64uFromBytes(new TextEncoder().encode(s));
export const stringFromB64u = (s: string) => new TextDecoder().decode(bytesFromB64u(s));
```

> **Why this matters.** v1 put raw base64 into `?proof=` unescaped. Base64's alphabet contains `+`, which decodes to a space in a query string, and `atob` strips ASCII whitespace per spec — so the byte vanishes. For a ~600-char payload, the chance of containing no `+` is about 1 in 12,000. Every QR and every WhatsApp link would have failed. base64url has no such character.

### 0.3 Crypto primitives

```typescript
// packages/core/src/crypto.ts
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha256";
import { canonicalize } from "./canonical";
import { b64uFromBytes, bytesFromB64u } from "./b64u";

// Required by @noble/ed25519 v2 for the sync API. Note concatBytes — sha512()
// takes ONE argument, so `(...m) => sha512(...m)` silently hashes the wrong thing.
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export type Disclosure = [salt: string, key: string, value: unknown];

export function randomSalt(): string {
  return b64uFromBytes(ed.etc.randomBytes(16));
}

/** 128-bit truncated commitment. Keeps the QR scannable. */
export function hashDisclosure(d: Disclosure): string {
  return b64uFromBytes(sha256(new TextEncoder().encode(canonicalize(d))).slice(0, 16));
}

export function generateKeypair() {
  const priv = ed.utils.randomPrivateKey();
  return {
    privateKey: b64uFromBytes(priv),
    publicKey: b64uFromBytes(ed.getPublicKey(priv)),
  };
}

export function signPayload(payload: object, privateKeyB64u: string): string {
  const msg = new TextEncoder().encode(canonicalize(payload));
  return b64uFromBytes(ed.sign(msg, bytesFromB64u(privateKeyB64u)));
}

export function verifyPayload(sigB64u: string, payload: object, publicKeyB64u: string): boolean {
  try {
    const msg = new TextEncoder().encode(canonicalize(payload));
    return ed.verify(bytesFromB64u(sigB64u), msg, bytesFromB64u(publicKeyB64u));
  } catch {
    return false;
  }
}
```

### 0.4 Types

```typescript
// packages/core/src/types.ts
import type { Disclosure } from "./crypto";

export type CredentialType = "nimc" | "bank";

/** What the issuer signs. Contains commitments only — no claim values. */
export interface SignedCredential {
  id: string;
  type: CredentialType;
  issuer: string;
  issued_at: number;
  expires_at: number;
  claim_hashes: string[]; // sorted; order reveals nothing
  signature: string;
}

/** What the wallet stores. `disclosures` never leaves the device wholesale. */
export interface WalletCredential {
  credential: SignedCredential;
  disclosures: Disclosure[];
}

export interface Proof {
  proof_id: string;
  template: TemplateId;
  credential: SignedCredential;
  disclosures: Disclosure[]; // ONLY the revealed ones
  nonce?: string;            // binds the proof to one verifier request
  audience?: string;
  generated_at: number;
  expires_at: number;
}

export type TemplateId = "i_am_adult" | "ng_under_26" | "i_earn_enough" | "i_am_verified";

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  template?: TemplateId;
  disclosed?: Record<string, unknown>;
  issuer?: string;
  receipt_id?: string;
  verified_at?: string;
  logged?: boolean;
}

export type PublicKeys = Record<CredentialType, string>;
```

### 0.5 Templates

```typescript
// packages/core/src/templates.ts
import type { CredentialType, TemplateId } from "./types";

export interface Template {
  id: TemplateId;
  label: string;
  description: string;
  credentialType: CredentialType;
  /** Exactly these keys must be disclosed — no more, no fewer. */
  reveals: string[];
  hides: string[];
  icon: string;
  /** The predicate the disclosed values must actually satisfy. */
  satisfied: (claims: Record<string, unknown>) => boolean;
}

export const TEMPLATES: Record<TemplateId, Template> = {
  i_am_adult: {
    id: "i_am_adult",
    label: "I am an adult",
    description: "Proves you are 18 or older",
    credentialType: "nimc",
    reveals: ["is_adult"],
    hides: ["NIN", "date of birth", "age band", "nationality"],
    icon: "🪪",
    satisfied: (c) => c.is_adult === true,
  },
  ng_under_26: {
    id: "ng_under_26",
    label: "Nigerian, under 26",
    description: "Proves age band and nationality — for student/youth pricing",
    credentialType: "nimc",
    reveals: ["is_adult", "age_band", "nationality"],
    hides: ["NIN", "date of birth", "name"],
    icon: "🎓",
    satisfied: (c) => c.is_adult === true && c.age_band === "18-25" && c.nationality === "NG",
  },
  i_earn_enough: {
    id: "i_earn_enough",
    label: "I earn ₦100k+ a month",
    description: "Proves an income threshold and an active account",
    credentialType: "bank",
    reveals: ["account_status", "income_at_least_100k"],
    hides: ["exact salary", "income bracket", "account number", "BVN", "balance"],
    icon: "💰",
    satisfied: (c) => c.account_status === "active" && c.income_at_least_100k === true,
  },
  i_am_verified: {
    id: "i_am_verified",
    label: "I am bank verified",
    description: "Proves your BVN is verified",
    credentialType: "bank",
    reveals: ["bvn_verified"],
    hides: ["account number", "BVN", "balance", "income"],
    icon: "✅",
    satisfied: (c) => c.bvn_verified === true,
  },
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);
```

### 0.6 The verifier

One function, used by the browser **and** the verifier API. No divergence possible.

```typescript
// packages/core/src/verify.ts
import { hashDisclosure, verifyPayload } from "./crypto";
import { TEMPLATES } from "./templates";
import type { Proof, PublicKeys, VerifyResult } from "./types";

const CLOCK_SKEW = 60; // seconds

export function verifyProof(
  proof: Proof,
  publicKeys: PublicKeys,
  expect?: { nonce?: string; audience?: string }
): VerifyResult {
  const now = Math.floor(Date.now() / 1000);

  const template = TEMPLATES[proof?.template];
  if (!template) return { valid: false, reason: "Unknown proof template" };

  // 1. Freshness — checked HERE, server-side. Never trust the presenter's clock.
  if (typeof proof.expires_at !== "number" || proof.expires_at + CLOCK_SKEW < now) {
    return { valid: false, reason: "Proof has expired" };
  }

  const cred = proof.credential;
  if (!cred || !Array.isArray(cred.claim_hashes)) {
    return { valid: false, reason: "Malformed credential" };
  }
  if (cred.expires_at + CLOCK_SKEW < now) {
    return { valid: false, reason: "Credential expired" };
  }

  // 2. Issuer signature over the commitments
  const pub = publicKeys[cred.type];
  if (!pub) return { valid: false, reason: `Unknown issuer type: ${cred.type}` };

  const { signature, ...unsigned } = cred;
  if (!verifyPayload(signature, unsigned, pub)) {
    return { valid: false, reason: "Invalid signature" };
  }

  // 3. Each disclosed triple must hash into the signed set
  const signedSet = new Set(cred.claim_hashes);
  const disclosed: Record<string, unknown> = {};
  for (const d of proof.disclosures ?? []) {
    if (!Array.isArray(d) || d.length !== 3) return { valid: false, reason: "Malformed disclosure" };
    if (!signedSet.has(hashDisclosure(d))) {
      return { valid: false, reason: "Disclosure does not match signed credential" };
    }
    const [, key, value] = d;
    if (key in disclosed) return { valid: false, reason: "Duplicate disclosed claim" };
    disclosed[key] = value;
  }

  // 4. The disclosure set must be EXACTLY what the template calls for.
  //    Without this a holder can disclose nothing and still look like a pass.
  const got = Object.keys(disclosed).sort().join(",");
  const want = [...template.reveals].sort().join(",");
  if (got !== want) return { valid: false, reason: "Disclosed claims do not match the template" };

  // 5. The values must actually satisfy the claim being made.
  if (!template.satisfied(disclosed)) {
    return { valid: false, reason: `Does not meet the requirement: ${template.label}` };
  }

  // 6. Replay binding, when the verifier issued a request
  if (expect?.nonce && proof.nonce !== expect.nonce) {
    return { valid: false, reason: "Proof was not issued for this request" };
  }
  if (expect?.audience && proof.audience !== expect.audience) {
    return { valid: false, reason: "Proof was issued for a different verifier" };
  }

  return {
    valid: true,
    template: proof.template,
    disclosed,
    issuer: cred.issuer,
    verified_at: new Date().toISOString(),
  };
}
```

```typescript
// packages/core/src/index.ts
export * from "./b64u";
export * from "./canonical";
export * from "./crypto";
export * from "./templates";
export * from "./types";
export * from "./verify";
```

---

## Step 1 — Issuer API

### 1.1 Generate keys

```typescript
// packages/issuer-api/scripts/generate-keys.ts
import { generateKeypair } from "@pruve/core";
import fs from "fs";
import path from "path";

const out = path.resolve(process.cwd(), ".keys.json");
if (fs.existsSync(out)) {
  console.error("Refusing to overwrite existing .keys.json. Delete it first if you mean it.");
  process.exit(1);
}

fs.writeFileSync(out, JSON.stringify({ nimc: generateKeypair(), bank: generateKeypair() }, null, 2));
console.log(`Keys written to ${out}`);
console.log("Confirm .keys.json is in .gitignore before you commit anything.");
```

```json
// packages/issuer-api/package.json
{
  "name": "@pruve/issuer-api",
  "private": true,
  "type": "module",
  "scripts": {
    "keys": "tsx scripts/generate-keys.ts",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@pruve/core": "*",
    "hono": "^4.6.13"
  }
}
```

```bash
npm run keys
```

### 1.2 Key loading — throw, never fall back

This is the "Env Safety" section from v1, wired into the actual code path instead of floating unattached at the bottom of the document.

```typescript
// packages/issuer-api/src/keys.ts
import fs from "fs";
import path from "path";
import type { CredentialType } from "@pruve/core";

export type KeyPair = { privateKey: string; publicKey: string };
export type IssuerKeys = Record<CredentialType, KeyPair>;

export function loadKeys(): IssuerKeys {
  // Production: a single env var holding the JSON.
  const fromEnv = process.env.ISSUER_KEYS_JSON;
  if (fromEnv) return JSON.parse(fromEnv);

  // Local dev: the gitignored file.
  const file = path.resolve(process.cwd(), ".keys.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8"));

  throw new Error(
    "No issuer keys. Set ISSUER_KEYS_JSON or run `npm run keys`. Refusing to start with generated keys."
  );
}
```

### 1.3 Mock claim derivation

Claims are derived **deterministically from the input** so you can demo a legitimate rejection. v1 hardcoded `is_adult: true`, which meant the only failure you could show was tampering — and a judge asking "what happens if I'm 16?" got nothing.

```typescript
// packages/issuer-api/src/claims.ts
const lastDigit = (s: string) => Number(s.trim().slice(-1)) || 0;

export function nimcClaims(nin: string) {
  const d = lastDigit(nin);
  if (d <= 1) return { is_adult: false, age_band: "under_18", nationality: "NG" };
  if (d <= 4) return { is_adult: true, age_band: "18-25", nationality: "NG" };
  if (d <= 7) return { is_adult: true, age_band: "26-35", nationality: "NG" };
  if (d === 8) return { is_adult: true, age_band: "36-50", nationality: "NG" };
  return { is_adult: true, age_band: "51+", nationality: "NG" };
}

export function bankClaims(account: string) {
  const d = lastDigit(account);
  return {
    account_status: d === 0 ? "inactive" : "active",
    bvn_verified: d > 1,
    income_at_least_100k: d >= 3,
    income_at_least_500k: d >= 8,
  };
}
```

**Cheat sheet for demo day — memorise this:**

| Input ends in | NIMC result | Bank result |
|---|---|---|
| `0` | under 18 → adult check **fails** | inactive, unverified → both bank checks **fail** |
| `1` | under 18 → adult check **fails** | active, unverified → BVN check **fails** |
| `2` | 18-25 → adult + under-26 **pass** | active, verified, under ₦100k → income **fails** |
| `3`–`4` | 18-25 → adult + under-26 **pass** | all bank checks **pass** |
| `5`–`7` | 26-35 → adult passes, under-26 **fails** | all bank checks **pass** |
| `8`–`9` | 36+ → adult passes, under-26 **fails** | all bank checks **pass** |

### 1.4 Server

```typescript
// packages/issuer-api/src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { randomUUID } from "crypto";
import {
  hashDisclosure,
  randomSalt,
  signPayload,
  type Disclosure,
  type SignedCredential,
  type WalletCredential,
} from "@pruve/core";
import { loadKeys } from "./keys";
import { bankClaims, nimcClaims } from "./claims";

const KEYS = loadKeys();
const YEAR = 60 * 60 * 24 * 365;

const app = new Hono();
app.use("*", cors());

function issue(
  type: "nimc" | "bank",
  issuerName: string,
  claims: Record<string, unknown>
): WalletCredential {
  const disclosures: Disclosure[] = Object.entries(claims).map(([k, v]) => [randomSalt(), k, v]);
  const now = Math.floor(Date.now() / 1000);

  const unsigned: Omit<SignedCredential, "signature"> = {
    id: `cred_${randomUUID()}`,
    type,
    issuer: issuerName,
    issued_at: now,
    expires_at: now + YEAR,
    claim_hashes: disclosures.map(hashDisclosure).sort(), // sorted: order leaks nothing
  };

  const signature = signPayload(unsigned, KEYS[type].privateKey);
  return { credential: { ...unsigned, signature }, disclosures };
}

app.get("/health", (c) => c.json({ ok: true }));

app.get("/public-keys", (c) =>
  c.json({ nimc: KEYS.nimc.publicKey, bank: KEYS.bank.publicKey })
);

app.post("/issue/nimc", async (c) => {
  const { nin } = await c.req.json().catch(() => ({ nin: "" }));
  if (!/^\d{11}$/.test(String(nin ?? ""))) {
    return c.json({ error: "NIN must be 11 digits" }, 400);
  }
  // The NIN is used to look up claims and is never persisted or logged.
  return c.json(issue("nimc", "mock-nimc.pruve.ng", nimcClaims(String(nin))));
});

app.post("/issue/bank", async (c) => {
  const { account } = await c.req.json().catch(() => ({ account: "" }));
  if (!/^\d{10}$/.test(String(account ?? ""))) {
    return c.json({ error: "Account number must be 10 digits" }, 400);
  }
  return c.json(issue("bank", "mock-gtbank.pruve.ng", bankClaims(String(account))));
});

// No /verify endpoint. On purpose. The issuer must not learn who verified what.

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`Issuer API → http://localhost:${port}`);
```

**Test before moving on:**

```bash
npm -w @pruve/issuer-api run dev

curl -s -X POST http://localhost:3001/issue/nimc \
  -H "Content-Type: application/json" -d '{"nin":"12345678903"}' | jq
```

You should get `{ credential: { claim_hashes: [...], signature: "..." }, disclosures: [[salt, key, value], ...] }`.

**Check the privacy property yourself right now:** `credential` contains no claim values. That is the thing v1 got wrong.

---

## Step 2 — Deploy (yes, on Day 1)

Nothing below works across two devices on `localhost`. Pick one path and do it before you write any UI.

### Fast path — Cloudflare tunnels (no account, instant HTTPS)

```bash
# one terminal per service
cloudflared tunnel --url http://localhost:3001   # issuer
cloudflared tunnel --url http://localhost:3003   # verifier API
cloudflared tunnel --url http://localhost:3000   # holder
cloudflared tunnel --url http://localhost:3002   # verifier web
```

Each prints a `https://<random>.trycloudflare.com` URL. Paste them into env files. URLs change on restart, so keep the tunnels up for the whole session.

### Stable path — before you present

- `packages/issuer-api`, `packages/verifier-api` → Railway or Fly (attach a volume for `receipts.db`)
- `apps/holder`, `apps/verifier` → Vercel

### Env files

Every one of these is gitignored, so **commit a `.env.example` beside each**.
Without them a teammate clones the repo, gets no config, and walks straight into
the bootstrap failure described below.

```bash
# apps/holder/.env.local   (+ commit apps/holder/.env.example)
NEXT_PUBLIC_ISSUER_URL=https://<issuer>
NEXT_PUBLIC_VERIFIER_API_URL=https://<verifier-api>
NEXT_PUBLIC_VERIFIER_URL=https://<verifier-web>
```

```bash
# apps/verifier/.env.local   (+ commit apps/verifier/.env.example)
NEXT_PUBLIC_ISSUER_URL=https://<issuer>
NEXT_PUBLIC_VERIFIER_API_URL=https://<verifier-api>
NEXT_PUBLIC_HOLDER_URL=https://<holder>
NEXT_PUBLIC_VERIFIER_ID=pruve_demo_venue
```

```bash
# packages/verifier-api/.env   (+ commit packages/verifier-api/.env.example)
ISSUER_URL=https://<issuer>
PORT=3003
```

> **`NEXT_PUBLIC_*` is inlined at build time, not read at runtime.** Changing it
> on Vercel without redeploying changes nothing. Set it before `next build`.

### Nothing loads a `.env` file on its own

Neither `tsx` nor `node` reads `.env` unless you ask. Skip this and
`process.env.ISSUER_URL` is `undefined`, the key fetch requests
`undefined/public-keys`, and the service quietly survives *only* if a stale
`.pubkeys.json` happens to be on disk — which on a fresh clone it never is. The
failure surfaces as `Issuer unreachable and no cached public keys`, with no way
to ever populate the cache.

```typescript
// packages/verifier-api/src/env.ts
import fs from "node:fs";
import path from "node:path";

/** Real environment variables always win, so a deployed PORT/ISSUER_URL is
 *  never clobbered by a checked-in file. */
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
```

```typescript
// packages/verifier-api/src/bootstrap-env.ts
import { loadEnv } from "./env.js";

loadEnv();
```

```typescript
// packages/verifier-api/src/index.ts — MUST be the first import
import "./bootstrap-env.js";
```

**It has to be a side-effect import, not a `loadEnv()` call in the module body.**
ESM hoists every `import` and evaluates dependencies in declaration order, so a
statement in the body runs *after* all of them — too late for `db.ts` (which
reads `DB_PATH`) and `keys.ts` (which reads `ISSUER_URL`) at module scope.

### Both Next apps need the workspace package transpiled

```javascript
// apps/holder/next.config.mjs  (and apps/verifier/next.config.mjs)
/** @type {import('next').NextConfig} */
export default { transpilePackages: ["@pruve/core"] };
```

---

## Step 3 — Holder app

### 3.1 Wallet store

```typescript
// apps/holder/lib/store.ts
import type { CredentialType, WalletCredential } from "@pruve/core";

const KEY = "pruve_wallet_v2";

export function getWallet(): WalletCredential[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function getCredential(type: CredentialType): WalletCredential | undefined {
  return getWallet().find((w) => w.credential.type === type);
}

export function saveCredential(entry: WalletCredential) {
  const wallet = getWallet().filter((w) => w.credential.type !== entry.credential.type);
  wallet.push(entry);
  localStorage.setItem(KEY, JSON.stringify(wallet));
}

export function clearWallet() {
  localStorage.removeItem(KEY);
}
```

### 3.2 Proof builder — this is where selective disclosure happens

```typescript
// apps/holder/lib/proof.ts
import { TEMPLATES, type Proof, type TemplateId, type WalletCredential } from "@pruve/core";

export function buildProof(
  entry: WalletCredential,
  templateId: TemplateId,
  binding?: { nonce?: string; audience?: string }
): Proof {
  const template = TEMPLATES[templateId];
  const now = Math.floor(Date.now() / 1000);

  // Filter to the template's fields. Everything else stays on the device as a
  // hash of a salt the verifier will never see.
  const disclosures = entry.disclosures.filter(([, key]) => template.reveals.includes(key));

  if (disclosures.length !== template.reveals.length) {
    throw new Error("This credential does not carry the claims this template needs");
  }

  return {
    proof_id: `prf_${crypto.randomUUID()}`,
    template: templateId,
    credential: entry.credential, // commitments + signature only
    disclosures,
    nonce: binding?.nonce,
    audience: binding?.audience,
    generated_at: now,
    expires_at: now + 300,
  };
}

/** Lets the holder see what the verifier will see, before sending. */
export function previewDisclosure(entry: WalletCredential, templateId: TemplateId) {
  const t = TEMPLATES[templateId];
  const shown = entry.disclosures.filter(([, k]) => t.reveals.includes(k));
  return Object.fromEntries(shown.map(([, k, v]) => [k, v]));
}
```

### 3.3 Wallet home

```tsx
// apps/holder/app/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TEMPLATE_LIST, type WalletCredential } from "@pruve/core";
import { getWallet } from "@/lib/store";

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletCredential[] | null>(null);

  useEffect(() => setWallet(getWallet()), []);

  const has = (t: string) => !!wallet?.some((w) => w.credential.type === t);

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Pruve</h1>
      <p className="text-zinc-400 text-sm mb-8">Your identity. Your control.</p>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Your credentials</h2>
        <div className="space-y-3">
          <CredCard label="NIMC Identity" linked={has("nimc")} href="/onboard/nimc" />
          <CredCard label="Bank Account" linked={has("bank")} href="/onboard/bank" />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Prove something</h2>
        <div className="space-y-3">
          {TEMPLATE_LIST.map((t) => {
            const available = has(t.credentialType);
            const body = (
              <>
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <p className="font-medium text-sm">{t.label}</p>
                  <p className="text-zinc-500 text-xs">{t.description}</p>
                </div>
              </>
            );
            const base = "flex items-center gap-4 p-4 rounded-2xl border transition";

            // Render a div when unavailable — a Link with href="#" still navigates,
            // which made v1's "disabled" cards feel broken.
            return available ? (
              <Link
                key={t.id}
                href={`/share?template=${t.id}`}
                className={`${base} border-zinc-700 bg-zinc-900 hover:border-white`}
              >
                {body}
              </Link>
            ) : (
              <div
                key={t.id}
                aria-disabled
                className={`${base} border-zinc-800 bg-zinc-900/40 opacity-40`}
              >
                {body}
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-zinc-600 text-xs mt-10 leading-relaxed">
        To answer a verifier&apos;s request, point your phone camera at their QR code.
      </p>
    </main>
  );
}

function CredCard({ label, linked, href }: { label: string; linked: boolean; href: string }) {
  const inner = (
    <>
      <span className="text-sm font-medium">{label}</span>
      <span
        className={`text-xs px-2 py-1 rounded-full ${
          linked ? "bg-green-900 text-green-400" : "bg-zinc-800 text-zinc-400"
        }`}
      >
        {linked ? "✓ Linked" : "Link →"}
      </span>
    </>
  );
  const cls = "flex items-center justify-between p-4 rounded-2xl border border-zinc-800 bg-zinc-900";

  return linked ? (
    <div className={cls}>
      {inner}
      <Link href={href} className="sr-only">
        Re-link {label}
      </Link>
    </div>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}
```

### 3.4 Onboarding

```tsx
// apps/holder/app/onboard/nimc/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCredential } from "@/lib/store";

const ISSUER = process.env.NEXT_PUBLIC_ISSUER_URL!;

export default function OnboardNimc() {
  const [nin, setNin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLink() {
    setError("");
    if (!/^\d{11}$/.test(nin)) return setError("Enter a valid 11-digit NIN");
    setLoading(true);
    try {
      const res = await fetch(`${ISSUER}/issue/nimc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nin }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Issuance failed");
      saveCredential(await res.json());
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the issuer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">Link NIMC</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Your NIN fetches your credential and is never stored — not by us, not on this phone.
      </p>
      <input
        inputMode="numeric"
        placeholder="Enter NIN (11 digits)"
        value={nin}
        onChange={(e) => setNin(e.target.value.replace(/\D/g, ""))}
        maxLength={11}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-white mb-4 outline-none focus:border-white"
      />
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <button
        onClick={handleLink}
        disabled={loading}
        className="w-full bg-white text-black font-semibold rounded-xl p-4 disabled:opacity-50"
      >
        {loading ? "Linking…" : "Link credential"}
      </button>
      <p className="text-zinc-600 text-xs mt-6">
        Demo issuer: the last digit decides the claims. Ends in 0 or 1 → under 18.
      </p>
    </main>
  );
}
```

`apps/holder/app/onboard/bank/page.tsx` is the same file with: `account` instead of `nin`, `/^\d{10}$/`, `maxLength={10}`, and `POST ${ISSUER}/issue/bank` with body `{ account }`.

### 3.5 Share / present

Handles both flows. Bound (`?rid=…&nonce=…`) when the holder scanned a verifier's request QR; unbound when the holder initiated from the wallet.

```tsx
// apps/holder/app/share/page.tsx
"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";
import { TEMPLATES, b64uFromString, type TemplateId } from "@pruve/core";
import { getCredential } from "@/lib/store";
import { buildProof, previewDisclosure } from "@/lib/proof";

function ShareContent() {
  const params = useSearchParams();
  const templateId = params.get("template") as TemplateId | null;
  const rid = params.get("rid");
  const nonce = params.get("nonce") ?? undefined;
  const audience = params.get("aud") ?? undefined;
  const api = params.get("api") ?? process.env.NEXT_PUBLIC_VERIFIER_API_URL;

  const template = templateId ? TEMPLATES[templateId] : undefined;
  const entry = useMemo(
    () => (template ? getCredential(template.credentialType) : undefined),
    [template]
  );

  const [step, setStep] = useState<"confirm" | "qr" | "sent">("confirm");
  const [proofUrl, setProofUrl] = useState("");
  const [sent, setSent] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!template) return <Shell><p>Unknown template.</p></Shell>;
  if (!entry) {
    return (
      <Shell>
        <p className="mb-4">You haven&apos;t linked a {template.credentialType.toUpperCase()} credential yet.</p>
        <a href={`/onboard/${template.credentialType}`} className="underline">Link it now →</a>
      </Shell>
    );
  }

  const preview = previewDisclosure(entry, template.id);

  async function handleConfirm() {
    setError("");
    setBusy(true);
    try {
      const proof = buildProof(entry!, template!.id, { nonce, audience });

      if (rid && api) {
        // Bound flow — send straight to the verifier that asked.
        const res = await fetch(`${api}/requests/${rid}/present`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proof }),
        });
        setSent(await res.json());
        setStep("sent");
      } else {
        // Unbound link flow — base64url, never raw base64.
        const encoded = b64uFromString(JSON.stringify(proof));
        setProofUrl(`${process.env.NEXT_PUBLIC_VERIFIER_URL}/verify?proof=${encoded}`);
        setStep("qr");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the proof");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      {step === "confirm" && (
        <>
          <h1 className="text-xl font-bold mb-2">{template.label}</h1>
          <p className="text-zinc-400 text-sm mb-2">{template.description}</p>
          {audience && (
            <p className="text-amber-400 text-xs mb-6">Requested by: {audience}</p>
          )}

          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3 mt-6">
            Exactly this will be sent
          </p>
          <div className="space-y-2 mb-6">
            {Object.entries(preview).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm text-green-400">
                <span>✓ {k.replace(/_/g, " ")}</span>
                <span className="font-mono">{String(v)}</span>
              </div>
            ))}
          </div>

          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Stays on this phone</p>
          <div className="space-y-2 mb-8">
            {template.hides.map((f) => (
              <div key={f} className="flex items-center gap-3 text-sm text-zinc-600">
                <span>✗</span> {f}
              </div>
            ))}
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="w-full bg-white text-black font-semibold rounded-xl p-4 disabled:opacity-50"
          >
            {busy ? "Working…" : rid ? "Send proof" : "Generate proof"}
          </button>
        </>
      )}

      {step === "qr" && (
        <>
          <h1 className="text-xl font-bold mb-2">Show this QR</h1>
          <p className="text-zinc-400 text-sm mb-6">Expires in 5 minutes. Single use.</p>
          <div className="bg-white p-5 rounded-2xl mb-6 flex justify-center">
            <QRCode value={proofUrl} size={280} level="L" />
          </div>
          <button
            onClick={() =>
              window.open(
                `https://wa.me/?text=${encodeURIComponent(
                  `Verify my identity (expires in 5 min): ${proofUrl}`
                )}`,
                "_blank"
              )
            }
            className="w-full bg-green-600 text-white font-semibold rounded-xl p-4 mb-3"
          >
            Share via WhatsApp
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(proofUrl)}
            className="w-full bg-zinc-800 text-white font-semibold rounded-xl p-4"
          >
            Copy link
          </button>
        </>
      )}

      {step === "sent" && (
        <div className="text-center py-12">
          <p className="text-5xl mb-4">{sent?.valid ? "✅" : "❌"}</p>
          <p className="text-xl font-bold mb-2">{sent?.valid ? "Proof accepted" : "Proof rejected"}</p>
          <p className="text-zinc-400 text-sm">{sent?.reason ?? "The verifier has their answer."}</p>
          <a href="/" className="inline-block mt-8 text-sm underline text-zinc-400">
            Back to wallet
          </a>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">{children}</main>;
}

export default function SharePage() {
  return (
    <Suspense fallback={<Shell><p className="text-zinc-500">Loading…</p></Shell>}>
      <ShareContent />
    </Suspense>
  );
}
```

Add `NEXT_PUBLIC_VERIFIER_URL` to `apps/holder/.env.local` for the link flow.

---

## Step 4 — Verifier API

The verifier's own backend. Separate service, separate trust domain. It re-verifies independently of the browser, enforces single use, and owns the audit log.

```json
// packages/verifier-api/package.json
{
  "name": "@pruve/verifier-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@pruve/core": "*",
    "hono": "^4.6.13"
  }
}
```

No SQLite dependency: `node:sqlite` is part of Node 22+.

```typescript
// packages/verifier-api/src/keys.ts
import fs from "fs";
import path from "path";
import type { PublicKeys } from "@pruve/core";

const CACHE = path.resolve(process.cwd(), ".pubkeys.json");
let keys: PublicKeys | null = null;

/** Trust-on-first-use, then cached on disk. This is what makes offline verification real. */
export async function getPublicKeys(): Promise<PublicKeys> {
  if (keys) return keys;
  try {
    const res = await fetch(`${process.env.ISSUER_URL}/public-keys`, {
      signal: AbortSignal.timeout(3000),
    });
    keys = (await res.json()) as PublicKeys;
    fs.writeFileSync(CACHE, JSON.stringify(keys));
    console.log("Public keys refreshed from issuer");
  } catch {
    if (!fs.existsSync(CACHE)) {
      throw new Error("Issuer unreachable and no cached public keys. Start the issuer once.");
    }
    keys = JSON.parse(fs.readFileSync(CACHE, "utf-8"));
    console.warn("Issuer unreachable — using cached public keys (this is the offline path)");
  }
  return keys!;
}
```

```typescript
// packages/verifier-api/src/db.ts
import { DatabaseSync } from "node:sqlite";

// node:sqlite ships with Node itself — no native build step, no prebuild
// download, nothing to compile on the demo laptop or the deploy target.
export const db = new DatabaseSync(process.env.DB_PATH ?? "receipts.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    id             TEXT PRIMARY KEY,
    proof_id       TEXT,
    template       TEXT,
    issuer         TEXT,
    result         TEXT NOT NULL,      -- 'valid' | 'invalid'
    reason         TEXT,
    disclosed_keys TEXT,               -- JSON array of KEY NAMES ONLY, never values
    verifier_id    TEXT,
    verified_at    INTEGER NOT NULL
  );

  -- Separate table so a replay attempt still gets its own receipt row.
  CREATE TABLE IF NOT EXISTS used_proofs (
    proof_id TEXT PRIMARY KEY,
    used_at  INTEGER NOT NULL
  );
`);
```

> The receipt records **which claim keys were checked, not what they said**. That is what lets you say "the verifier carries zero data liability" and have it be true of the database on disk.

```typescript
// packages/verifier-api/src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { randomUUID } from "crypto";
import { TEMPLATES, verifyProof, type Proof, type TemplateId, type VerifyResult } from "@pruve/core";
import { getPublicKeys } from "./keys";
import { db } from "./db";

const app = new Hono();
app.use("*", cors());

type PendingRequest = {
  id: string;
  template: TemplateId;
  nonce: string;
  verifier_id: string;
  expires_at: number;
  result?: VerifyResult;
};

const requests = new Map<string, PendingRequest>();
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [id, r] of requests) if (r.expires_at < now) requests.delete(id);
}, 30_000).unref();

function logReceipt(
  result: VerifyResult,
  proof: Partial<Proof>,
  verifier_id: string
): string {
  const id = `rec_${randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO receipts
       (id, proof_id, template, issuer, result, reason, disclosed_keys, verifier_id, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    proof.proof_id ?? null,
    proof.template ?? null,
    result.issuer ?? null,
    result.valid ? "valid" : "invalid",
    result.reason ?? null,
    JSON.stringify(Object.keys(result.disclosed ?? {})), // keys only
    verifier_id,
    Math.floor(Date.now() / 1000)
  );
  return id;
}

/** Shared by the link flow and the request flow. */
async function checkProof(
  proof: Proof,
  verifier_id: string,
  expect?: { nonce?: string; audience?: string }
): Promise<VerifyResult> {
  let result: VerifyResult;
  try {
    result = verifyProof(proof, await getPublicKeys(), expect);
  } catch (err) {
    console.error("[verify] unexpected error:", err); // never debug this blind at 2am
    result = { valid: false, reason: "Verification error" };
  }

  // Single use — enforced, not just claimed in the UI copy.
  if (result.valid && proof.proof_id) {
    const seen = db.prepare(`SELECT 1 FROM used_proofs WHERE proof_id = ?`).get(proof.proof_id);
    if (seen) {
      result = { valid: false, reason: "Proof has already been used" };
    } else {
      db.prepare(`INSERT INTO used_proofs (proof_id, used_at) VALUES (?, ?)`).run(
        proof.proof_id,
        Math.floor(Date.now() / 1000)
      );
    }
  }

  // Every check is logged, pass or fail. A rejected check is the one an auditor wants.
  result.receipt_id = logReceipt(result, proof ?? {}, verifier_id);
  result.verified_at ??= new Date().toISOString();
  result.logged = true;
  return result;
}

app.get("/health", (c) => c.json({ ok: true }));

// ---- Link / WhatsApp flow -------------------------------------------------
app.post("/verify", async (c) => {
  const { proof, verifier_id } = await c.req.json().catch(() => ({}));
  if (!proof) return c.json({ valid: false, reason: "No proof supplied" }, 400);
  return c.json(await checkProof(proof, verifier_id ?? "unknown"));
});

// ---- Verifier-initiated request flow -------------------------------------
app.post("/requests", async (c) => {
  const { template, verifier_id } = await c.req.json().catch(() => ({}));
  if (!TEMPLATES[template as TemplateId]) {
    return c.json({ error: "Unknown template" }, 400);
  }
  const req: PendingRequest = {
    id: `req_${randomUUID().slice(0, 12)}`,
    template,
    nonce: randomUUID(),
    verifier_id: verifier_id ?? "unknown",
    expires_at: Math.floor(Date.now() / 1000) + 600,
  };
  requests.set(req.id, req);
  return c.json(req);
});

app.get("/requests/:id", (c) => {
  const req = requests.get(c.req.param("id"));
  if (!req) return c.json({ status: "expired" }, 404);
  return c.json({ status: req.result ? "complete" : "pending", result: req.result ?? null });
});

app.post("/requests/:id/present", async (c) => {
  const req = requests.get(c.req.param("id"));
  if (!req) return c.json({ valid: false, reason: "Request expired or unknown" }, 404);
  if (req.result) return c.json({ valid: false, reason: "This request was already answered" }, 409);

  const { proof } = await c.req.json().catch(() => ({}));
  if (!proof) return c.json({ valid: false, reason: "No proof supplied" }, 400);

  if (proof.template !== req.template) {
    req.result = { valid: false, reason: "Wrong template for this request" };
    logReceipt(req.result, proof, req.verifier_id);
    return c.json(req.result);
  }

  req.result = await checkProof(proof, req.verifier_id, {
    nonce: req.nonce,
    audience: req.verifier_id,
  });
  return c.json(req.result);
});

// ---- Audit log -----------------------------------------------------------
app.get("/receipts", (c) =>
  c.json(db.prepare(`SELECT * FROM receipts ORDER BY verified_at DESC LIMIT 50`).all())
);

const port = Number(process.env.PORT ?? 3003);
serve({ fetch: app.fetch, port });
console.log(`Verifier API → http://localhost:${port}`);
```

---

## Step 5 — Verifier web

Two pages. No camera, no app install, no scanner library.

### 5.1 Public key cache (browser)

```typescript
// apps/verifier/lib/keys.ts
import type { PublicKeys } from "@pruve/core";

const CACHE = "pruve_pubkeys";

export async function getPublicKeys(): Promise<{ keys: PublicKeys; fresh: boolean }> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_ISSUER_URL}/public-keys`, {
      signal: AbortSignal.timeout(3000),
    });
    const keys = (await res.json()) as PublicKeys;
    localStorage.setItem(CACHE, JSON.stringify(keys));
    return { keys, fresh: true };
  } catch {
    const cached = localStorage.getItem(CACHE);
    if (!cached) throw new Error("Issuer unreachable and no cached keys on this device");
    return { keys: JSON.parse(cached), fresh: false };
  }
}
```

### 5.2 Result card

Its own file — both verifier pages use it, and named exports out of a `page.tsx` are a Next.js convention you don't want to lean on.

```tsx
// apps/verifier/components/ResultCard.tsx
"use client";
import type { VerifyResult } from "@pruve/core";

export function ResultCard({ result, onReset }: { result: VerifyResult; onReset: () => void }) {
  return (
    <div
      className={`rounded-2xl p-6 border ${
        result.valid ? "border-green-700 bg-green-950" : "border-red-700 bg-red-950"
      }`}
    >
      <p className="text-4xl mb-3">{result.valid ? "✅" : "❌"}</p>
      <p className="text-xl font-bold mb-4">{result.valid ? "VERIFIED" : "NOT VERIFIED"}</p>

      {result.valid && result.disclosed && (
        <div className="space-y-2 mb-6">
          {Object.entries(result.disclosed).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm border-b border-green-900 pb-2">
              <span className="text-zinc-400 capitalize">{k.replace(/_/g, " ")}</span>
              <span className="font-medium">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {!result.valid && <p className="text-red-300 text-sm mb-4">{result.reason}</p>}

      <div className="text-xs text-zinc-500 space-y-1">
        {result.issuer && <p>Issued by: {result.issuer}</p>}
        <p>Checked: {result.verified_at}</p>
        {result.receipt_id && <p>Receipt: #{result.receipt_id}</p>}
        {result.logged === false && <p className="text-amber-500">Offline — not logged</p>}
      </div>

      <button onClick={onReset} className="mt-6 w-full bg-zinc-800 text-white rounded-xl p-3 text-sm">
        Check another
      </button>
    </div>
  );
}
```

### 5.3 Request page

```tsx
// apps/verifier/app/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { TEMPLATE_LIST, type TemplateId, type VerifyResult } from "@pruve/core";
import { ResultCard } from "@/components/ResultCard";

const API = process.env.NEXT_PUBLIC_VERIFIER_API_URL!;
const HOLDER = process.env.NEXT_PUBLIC_HOLDER_URL!;
const VERIFIER_ID = process.env.NEXT_PUBLIC_VERIFIER_ID ?? "pruve_demo";

export default function VerifierHome() {
  const [req, setReq] = useState<{ id: string; nonce: string; template: TemplateId } | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function ask(template: TemplateId) {
    setResult(null);
    const res = await fetch(`${API}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, verifier_id: VERIFIER_ID }),
    });
    const r = await res.json();
    setReq(r);

    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const poll = await fetch(`${API}/requests/${r.id}`).then((x) => x.json()).catch(() => null);
      if (poll?.status === "complete") {
        clearInterval(timer.current!);
        setResult(poll.result);
      }
    }, 1200);
  }

  function reset() {
    if (timer.current) clearInterval(timer.current);
    setReq(null);
    setResult(null);
  }

  const qrUrl = req
    ? `${HOLDER}/share?template=${req.template}&rid=${req.id}&nonce=${req.nonce}` +
      `&aud=${encodeURIComponent(VERIFIER_ID)}&api=${encodeURIComponent(API)}`
    : "";

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Pruve Verify</h1>
      <p className="text-zinc-400 text-sm mb-8">Ask for one fact. Get one answer.</p>

      {!req && (
        <div className="space-y-3">
          {TEMPLATE_LIST.map((t) => (
            <button
              key={t.id}
              onClick={() => ask(t.id)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-zinc-700 bg-zinc-900 hover:border-white text-left"
            >
              <span className="text-2xl">{t.icon}</span>
              <div>
                <p className="font-medium text-sm">{t.label}</p>
                <p className="text-zinc-500 text-xs">{t.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {req && !result && (
        <>
          <p className="text-zinc-400 text-sm mb-4">Point the customer&apos;s phone camera here.</p>
          <div className="bg-white p-5 rounded-2xl mb-6 flex justify-center">
            <QRCode value={qrUrl} size={280} level="L" />
          </div>
          <p className="text-center text-zinc-500 text-sm animate-pulse mb-6">Waiting for proof…</p>
          <button onClick={reset} className="w-full bg-zinc-800 rounded-xl p-3 text-sm">Cancel</button>
        </>
      )}

      {result && <ResultCard result={result} onReset={reset} />}
    </main>
  );
}
```

### 5.4 Link flow page

Verifies in the browser first (instant, works offline), then asks the verifier API to re-verify and log.

```tsx
// apps/verifier/app/verify/page.tsx
"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { stringFromB64u, verifyProof, type VerifyResult } from "@pruve/core";
import { getPublicKeys } from "@/lib/keys";
import { ResultCard } from "@/components/ResultCard";

const API = process.env.NEXT_PUBLIC_VERIFIER_API_URL!;
const VERIFIER_ID = process.env.NEXT_PUBLIC_VERIFIER_ID ?? "pruve_demo";

function VerifyContent() {
  const params = useSearchParams();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const ran = useRef(false); // StrictMode double-mounts effects in dev

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const encoded = params.get("proof");
      if (!encoded) {
        setResult({ valid: false, reason: "No proof in this link" });
        setLoading(false);
        return;
      }
      try {
        const proof = JSON.parse(stringFromB64u(encoded));

        // Local check — this is the path that works with the issuer switched off.
        const { keys } = await getPublicKeys();
        const local = verifyProof(proof, keys);

        // Authoritative check + receipt. Falls back to the local answer if unreachable.
        try {
          const res = await fetch(`${API}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proof, verifier_id: VERIFIER_ID }),
            signal: AbortSignal.timeout(5000),
          });
          setResult(await res.json());
        } catch {
          setResult({ ...local, logged: false });
        }
      } catch (err) {
        console.error("[verify] link flow:", err);
        setResult({ valid: false, reason: "Could not read this proof" });
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Pruve Verify</h1>
      <p className="text-zinc-400 text-sm mb-8">Shared proof</p>
      {loading && <p className="text-center py-12 text-zinc-400">Verifying…</p>}
      {result && (
        <ResultCard result={result} onReset={() => (window.location.href = "/")} />
      )}
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-zinc-950" />}>
      <VerifyContent />
    </Suspense>
  );
}
```

---

## Step 6 — Make the wallet feel like a phone app

### Do you need a native app? No — and one would hurt.

The core flow is *verifier shows a QR → native camera opens a URL*. A web app
opens instantly. A native app needs App Links / Universal Links, which require a
verified domain you control — **they do not work on a `trycloudflare.com`
tunnel**. The deep link would fail or dump the judge into a browser anyway.

On top of that: nobody installs an APK or joins TestFlight during a 5-minute
judging slot; "no app install" is already your pitch line for the verifier side;
the WhatsApp flow needs a browser regardless; and an Expo rewrite is two of your
four days spent re-solving solved problems.

What native genuinely buys you is **one** thing: an OS keystore for the salts,
plus a biometric gate before presenting. That is real — `localStorage` is
readable by anything with the device unlocked and by any XSS on your origin.
Say so, using the same framing as the ZK upgrade path:

> "The wallet is a PWA today. A native shell with keystore-backed salts is the
> production path — the credential format doesn't change."

So: installable PWA, not React Native.

### 6.1 Icons, generated from code

No binary blob in the repo to lose or regenerate by hand. `scripts/gen-icons.ts`
is a small PNG encoder plus signed-distance-field rendering, producing
`icon-192`, `icon-512`, a maskable `512`, a 180px `apple-touch-icon` and a
favicon into both apps' `public/`.

```bash
npm run icons
```

Maskable matters: Android crops the icon to a circle or squircle, so that
variant runs the background full-bleed and keeps the mark inside the centre
safe zone. Ship a square for iOS — it applies its own corner mask.

### 6.2 Manifest

```typescript
// apps/holder/app/manifest.ts  → served at /manifest.webmanifest
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pruve Wallet",
    short_name: "Pruve",
    description: "Prove one fact. Reveal nothing else.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

Keep `theme_color` identical to the page background or Android shows a visible
seam at the status bar.

**Do not add a manifest to the verifier.** Its entire pitch is "no app install";
making it installable muddies that, and the receipt log should never come from a
cache.

### 6.3 Viewport and Apple metadata

```typescript
// apps/holder/app/layout.tsx
export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  // Paint under the notch and home indicator; the body pads back out.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Pruve", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};
```

Note what is *not* there: `maximumScale` / `userScalable: false`. iOS auto-zoom
on input focus is a real annoyance, but the fix is a 16px input font-size, not
disabling pinch-zoom for everyone who needs it.

### 6.4 The CSS that actually decides whether it feels native

```css
/* apps/holder/app/globals.css */
@layer base {
  html {
    -webkit-text-size-adjust: 100%;   /* no text jump on rotate */
    background-color: #09090b;
  }

  body {
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    -webkit-tap-highlight-color: transparent;  /* the grey flash on tap */
    overscroll-behavior-y: none;               /* see below */
  }

  input, select, textarea { font-size: 16px; }  /* stops iOS focus zoom */

  button, a, [role="button"] { touch-action: manipulation; }  /* no 300ms delay */
}

@layer utilities {
  .pb-safe { padding-bottom: calc(1.5rem + env(safe-area-inset-bottom)); }
  .pt-safe { padding-top: calc(1.5rem + env(safe-area-inset-top)); }
}
```

`overscroll-behavior-y: none` is not cosmetic: pull-to-refresh would reload the
page mid-presentation and throw away a generated proof.

Every page shell in this guide already uses `min-h-dvh` plus the safe padding,
and this is why: `min-h-screen` compiles to `100vh`, which is wrong on mobile.
It ignores the browser chrome and gives you the jumpy cut-off bottom. If you
copied the shells from an older draft, swap them now:

```tsx
<main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
```

### 6.5 Service worker

Chrome on Android requires one with a fetch handler before it offers to install.
`apps/holder/public/sw.js` is network-first, so a redeploy or a changed tunnel
URL never serves stale code, and the cache is only an offline fallback.

It deliberately ignores two things:

- **non-GET requests** — credential issuance and proof presentation
- **cross-origin requests** — the issuer and verifier APIs

Caching either would put credential traffic in a disk cache and could replay a
stale verification result. Register it from a tiny client component
(`app/register-sw.tsx`) mounted in the layout.

### 6.6 Installing it

**PWA install requires HTTPS.** On `localhost` you get the service worker but no
install prompt from a phone. Run the tunnel from Step 2 and open *that* URL on
the phone: Chrome Android offers "Install app", iOS Safari offers "Add to Home
Screen".

---

## Running everything

```bash
npm run keys   # once
npm run icons  # once
npm run dev    # all four services
```

| Service | Port |
|---|---|
| Holder | 3000 |
| Issuer API | 3001 |
| Verifier web | 3002 |
| Verifier API | 3003 |

Then start your four tunnels and update the `.env` files.

### Automated checks

```bash
npm run verify:all     # typecheck + all three suites, ~70 assertions
```

| Command | What it covers |
|---|---|
| `npm run typecheck` | All three TS packages |
| `npm test` | 42 checks: canonical JSON, base64url, Ed25519, commitment hiding, every rejection path |
| `npm run smoke` | 18 checks over live HTTP — Scenarios 1–5 plus the audit log. Needs the stack up |
| `npm run test:offline` | 10 checks: verification with the issuer dead, and cold-start bootstrap from `.env` |
| `npm run qr-size` | Measures the real QR payload per template against your deployed URLs |

**Do not run `next build` while `next dev` is running.** It overwrites the dev
server's `.next` and throws 500s until it recompiles. Harmless, but it looks
exactly like a broken app if it happens while you are demoing.

**Then, by hand:** link NIMC with `12345678903` → tap "I am an adult" → confirm
the screen shows only `is_adult: true` → generate → open the link. Green.

---

## The ZK upgrade path

There is no Noir circuit here and that is a deliberate call, not a shortcut. Salted-commitment selective disclosure gets you real unlinkable-per-claim minimal disclosure with no WASM toolchain and no proving time.

What ZK would add on top: **predicate proofs over hidden values** — proving `age ≥ 18` from a hidden date of birth, rather than the issuer pre-computing an `is_adult` boolean. That is a genuine upgrade, and it is the honest thing to say:

> "The issuer signs hashed commitments; the wallet reveals only the salt-value pairs the template needs. Today the issuer pre-computes the thresholds. A ZK circuit would move that computation to the holder, so we wouldn't need the issuer to anticipate every question. Same commitment structure — the circuit slots in behind the same interface."

That answer survives a follow-up question. "We ran out of time on the circuit" doesn't.

---

## Demo scripts

Run each one end to end, on the real tunnel URLs, at least twice before you present.

### Scenario 1 — Age check at a venue (bound flow)

1. Verifier laptop: open verifier web → tap **I am an adult** → QR appears
2. Holder phone: **native camera** at the QR → notification opens the wallet
3. Wallet shows: *sends `is_adult: true` · stays on phone: NIN, date of birth, age band, nationality*
4. Tap **Send proof** → laptop flips to green in about a second

**What you say:** *"The bouncer never saw Tunde's NIN, his date of birth, or even his age. He asked one question and got one answer, plus a receipt. And notice what did not happen: NIMC was never told that this check took place."*

### Scenario 2 — Income check over WhatsApp (link flow)

1. Wallet → **I earn ₦100k+** → Generate proof → **Share via WhatsApp**
2. Open the link on a second device → green, receipt logged

**What you say:** *"The landlord opened a browser link. No app, no account. And he learned that Tunde clears ₦100k — not his salary, not his bracket, not his balance."*

### Scenario 3 — Under 18 (legitimate rejection)

1. Wallet → clear → link NIMC with a NIN ending in **0**
2. Verifier asks **I am an adult** → holder presents → **red**

**What you say:** *"Same flow, honest answer. The system isn't defending itself here — it's just working. And the venue still gets a receipt proving they checked."*

### Scenario 4 — Tampering (do this last)

1. Copy a proof link → decode the base64url → note that the credential contains **only hashes**
2. Change the disclosed value from `true` to `false`, or add a claim you never had
3. Re-encode, open → red: **Disclosure does not match signed credential**

**What you say:** *"Open the payload — go ahead. The undisclosed claims are 128-bit hashes of salts that never left the phone. You can't read them and you can't forge one, because changing any value breaks its commitment and the issuer's signature covers the whole set."*

> Scenario 4 is the one that invites the judges to inspect the payload. In v1 of this build that invitation was a trap: the full claim set was sitting in the QR in plaintext. Now it is the strongest moment in the demo. Make sure it stays that way — if you ever put a raw claim value back into `credential`, you have undone the entire pitch.

### Scenario 5 — Replay (30 seconds, optional)

Submit the same link twice. Second attempt: **Proof has already been used.**

---

## Failure modes to name in your pitch

| Failure | What you say |
|---|---|
| **Issuer server offline** | Verification is unaffected — it's a local Ed25519 check against a cached public key. Only new credential issuance stops. *(Demo it: kill the issuer, verify again.)* |
| **Revocation** | Not built. Production path: issuer publishes a signed revocation list; verifiers cache and check it. Our current mitigation is a 1-year credential expiry and short-lived proofs. |
| **Replay / proof sharing** | Bound flow: each proof carries a verifier-issued nonce and is single-use server-side. The WhatsApp link flow deliberately drops nonce binding for convenience — it's single-use and 5-minute-expiring, but anyone holding the link in that window can present it. That's a real trade and we'd disable it for high-value checks. |
| **Colluding verifier** | A verifier who receives a disclosure could resell it. Cryptography can't fix that — contracts and audit logs do. What we remove is the *bulk* liability: there's no NIN in their database to leak. |
| **Phone loss** | Wallet is gone; re-link from the issuer. Same as losing a bank card. Salts are device-local, so a stolen phone with no screen lock is a real exposure — production needs OS keystore encryption. |
| **Claim-count leakage** | The verifier can see how many claims a credential holds, just not which. Fixable with decoy hashes; not worth the complexity at this scale. |
| **Issuer is still trusted** | We remove the issuer from the verification path, not from the trust model. It can still issue false claims. Decentralised issuance is a different project. |

That last row wins more points than it costs. Naming the limit you did not solve is what separates a prototype from a pitch.

### One practical risk worth pre-empting: QR density

Commitment-based credentials are larger than plaintext ones. Measured against
`localhost` (`npm run qr-size`):

| Template | URL bytes | QR version @ ECC L |
|---|---|---|
| `i_am_adult` | 750 | v20 |
| `ng_under_26` | 874 | v25 |
| `i_earn_enough` | 877 | v25 |
| `i_am_verified` | 795 | v20 |

v25 at 280px scans fine but is not generous, and **a deployed HTTPS hostname
adds ~30–40 bytes**, pushing the three-claim templates toward v30.

This only affects the *unbound link flow*, where the holder displays a QR. Your
primary demo path — the verifier showing a request QR — is a short deep link at
roughly v15 and is comfortable. If a tunnel URL makes a holder-side QR flaky,
the Copy Link and WhatsApp buttons are the fallback. Re-measure against your
real URLs before you present.

---

## Judging criteria coverage

| Brief requirement | How Pruve hits it |
|---|---|
| Prove a fact without revealing the record | Salted claim commitments — undisclosed claims leave the device as unreadable hashes. Verifiable live: decode the QR. |
| Simple screen for the business | Verifier is a browser page. Tap a question, show a QR. No install, no camera permission, no training. |
| Record that the check happened | Receipt in the verifier's own database, logging the claim *keys* checked and the outcome — passes and failures. No claim values stored. |
| What stops faking a yes | Ed25519 over the commitment set, plus per-claim hash membership, plus a template predicate check. Three independent breaks required. |
| Why use it over demanding full ID | The verifier ends up holding a boolean and a receipt instead of a copy of someone's NIN. Nothing to breach. |

---

## Changes from v1, and why

| Changed | Reason |
|---|---|
| Salted claim commitments replace plaintext `claims` in the credential | v1 shipped the entire claim set inside every proof; `disclosed_claims` was decorative. The headline privacy claim was false of the code. |
| `/verify` removed from the issuer; verification moved to verifier + browser | v1 had the issuer see every verification — the exact phone-home the model exists to prevent. It also made the "works when the issuer is offline" failure-mode row untrue. |
| Receipts moved to a verifier-owned service | A receipt in the issuer's database proves nothing to the verifier. |
| base64url everywhere | Raw base64 in `?proof=` fails ~99.99% of the time: `+` → space → stripped by `atob`. Both QR and link flows were broken. |
| `@noble/hashes` added to dependencies; versions pinned | It was imported but never installed — Step 1 died on first run. `@latest` would now pull incompatible majors of both noble libs. |
| `sha512Sync` fixed to use `concatBytes` | `(...m) => sha512(...m)` hashes only the first argument. Silently wrong signatures. |
| `packages/core` workspace | v1 imported `@/types` in the holder app from a file that only existed in the issuer package. |
| Canonical JSON | v1's signatures depended on V8 preserving key insertion order across `JSON.parse`. |
| Proof expiry checked server-side; single use enforced | v1 checked expiry only in the browser and the "single use" label had nothing behind it. |
| Failed verifications logged | v1 inserted `result = 1` after the early returns — the audit log only ever recorded successes. |
| Claims derived from input | v1 hardcoded `is_adult: true`, so a legitimate rejection could not be demonstrated. |
| Income issued as threshold booleans | "I earn enough" revealed the bracket. Now it reveals one boolean. |
| "I am a student" → "Nigerian, under 26" | NIMC cannot prove enrolment. |
| Verifier-initiated requests with nonce | v1 had no way for the verifier to state what it needed, and no replay binding. |
| QR scanner libraries removed | Native camera → deep link. Drops `getUserMedia`, the secure-context restriction, a permission prompt, and the flakiest hardware step. |
| Deploy moved to Day 1 | Every URL in v1 was `localhost`; Scenario 1 ("open holder app on phone") could not run. |
| Pre-commit hook committed to `scripts/githooks` | `.git/hooks` is local-only — it protected nobody on the team. |
| `catch {}` now logs | v1 returned the same opaque string for every failure cause. |
| "Zero PII changes hands" softened | `age_band` and `nationality` are personal data. |
| `packages/circuits` removed | v1 ran `npm install` in a directory with no `package.json`. |

---

## v2.1 — what the first live run changed

Everything above has now been built and run. Two real bugs surfaced only once
the services were actually up, and both are the kind that pass every local test
and then fail on a teammate's laptop.

| Changed | Why |
|---|---|
| `env.ts` + `bootstrap-env.ts` in the verifier API | Nothing loaded `.env` — not tsx, not node. `ISSUER_URL` was `undefined` and the service ran only because a stale `.pubkeys.json` existed. A fresh clone could never bootstrap. |
| Side-effect import, not a `loadEnv()` call | ESM hoists imports, so a call in the module body runs after `db.ts` and `keys.ts` have already read `process.env`. |
| `.env.example` committed for all three services | The real env files are gitignored, so a teammate cloning hit exactly the failure above. |
| `better-sqlite3` → `node:sqlite` | Native module, needs a prebuild or a compiler. Built into Node 22+ instead — nothing to compile on the demo laptop or the deploy target. |
| `create-next-app` → hand-written Next apps | Inside a workspace it runs its own install, prompts interactively, and scaffolds a layout you immediately replace. |
| Node 22+ stated as a hard requirement | Consequence of `node:sqlite`. |
| Step 6: PWA + mobile layer | The holder was mobile-*sized* but not mobile-*ready*: no manifest, no icons, no install, no safe-area handling, `100vh` instead of `100dvh`. |
| Three test suites + `verify:all` | ~70 assertions covering the crypto, the live HTTP surface, and the offline/cold-start paths. |
| `qr-size` script | The payload question deserved a measurement, not a guess. |

**Test results at the time of writing:** typecheck clean, 42 core + 18 smoke +
10 offline assertions passing, both Next apps building for production, all six
pages rendering. Verified live: selective disclosure holds on the wire,
tampering and replay are rejected, an under-18 is correctly rejected, receipts
log failures as well as passes and store claim *keys* only, and verification
works with the issuer switched off.

**Still unverified:** the client-side React paths — localStorage persistence,
the confirm screen's reveals/hides list, QR rendering, and the verifier's
polling loop. The APIs beneath all of them are proven, so what remains is UI
wiring. Walk the five demo scenarios on a real phone over the tunnel before you
present.
