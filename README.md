# Pruve

**Prove one fact. Reveal nothing else.**

Show a bar you're over 18 without showing your NIN. Show a landlord you earn
enough without showing your statements. The verifier gets an answer they can
check themselves, and a receipt — and no identifier ever leaves your phone.

> **Track B · ICSC 2026 Hackathon · Team Phantom**

---

## The thing that makes this real

A proof is not a screenshot and not a boolean the UI decided to trust. The
issuer signs **hashed commitments**, one per claim, each salted with 128 bits
the verifier never sees. The wallet opens only the ones you chose.

Here is a complete `i_am_adult` proof — the entire payload a verifier receives:

```json
{
  "credential": {
    "claim_hashes": [
      "RTggiKZMfamIGIc9zl132Q",
      "_hodTbG2oHJS33pHnsmSDg",
      "w97CUq4antj2rq2_VyApsw"
    ],
    "signature": "…"
  },
  "disclosures": [
    ["UcWbSZhAqBwg4BiiPu1HyQ", "is_adult", true]
  ]
}
```

Three commitments signed. One value revealed. The holder's age band and
nationality are in there as hashes of salts that never left the device — not
filtered out by the UI, not encrypted, simply unreadable.

Change `true` to `false` and verification fails. Add a claim the issuer never
signed and it fails. Disclose nothing and claim a pass — it fails.

---

## Quick start

Requires **Node 22+** (the verifier stores receipts through `node:sqlite`).

```bash
npm install
npm run keys       # issuer signing keys, once
npm run registry   # synthetic identity dataset, once
npm run icons      # PWA icon set, once
npm run dev        # all six services
```

| Service | Port | |
| --- | --- | --- |
| Holder wallet | 3000 | the PWA you install |
| Issuer API | 3001 | mock NIMC, bank, card issuer |
| Verifier web | 3002 | reference verifier |
| Verifier API | 3003 | receipts, single-use registry |
| Campus Store | 3005 | a third-party merchant using the SDK |
| Developer API | 3006 | hosted verification (`/docs`) |

Then `npm run verify:all` — 107 assertions across five suites.

**Try it:** open `localhost:3005`, tap *Verify with Pruve*, and scan with the
wallet. Then open the inspector on the result and try to forge the proof.

---

## Architecture

```
                    ┌────────────────────────────┐
                    │        ISSUER API          │
                    │   NIMC · Bank · Card       │
                    │   signs commitments only   │
                    └─────┬──────────────────┬───┘
                          │                  │
          issuance (once) │                  │  public keys
                          ▼                  │  fetched once, then cached
        ┌──────────────────────────┐         │
        │      HOLDER WALLET       │         │
        │  salts never leave here  │         │
        └────────────┬─────────────┘         │
                     │  proof                │
                     ▼                       ▼
  ┌──────────────────────────────────────────────────────────┐
  │   VERIFIERS — independent, each verifies for itself      │
  │   Pruve Verifier · Campus Store · any site with the SDK  │
  └──────────────────────────────────────────────────────────┘
```

**The issuer is never told a verification happened.** It has no `/verify`
route. Verification is a local Ed25519 check against a cached key, which means
it keeps working with the issuer switched off — a property the test suite
asserts rather than claims.

---

## Integrating

Any site can accept Pruve proofs. Two ways in:

```ts
import { PruveVerifier } from "@pruve/sdk";

const pruve = new PruveVerifier({
  issuerUrl: "https://issuer.pruve.ng",
  verifierId: "campus_store",
});

const request = await pruve.createRequest("ng_under_26");
// show request.url as a QR, then:
const result = await pruve.verifyPresentation(request.id, proof);
```

That runs entirely in your process. Pruve is not in the request path and
cannot see your customers. A hosted REST API exists for integrators who can't
run TypeScript — and says plainly, in an `x-pruve-privacy` header on every
response, that using it costs you that property.

Full guide: **[`docs/INTEGRATION.md`](docs/INTEGRATION.md)**

---

## What a wallet can prove

| Template | Proves | Reveals |
| --- | --- | --- |
| `i_am_adult` | 18 or older | `is_adult` |
| `ng_under_26` | Nigerian, 18–25 | `is_adult`, `age_band`, `nationality` |
| `i_earn_enough` | Earns ₦100k+/month | `account_status`, `income_at_least_100k` |
| `i_am_verified` | BVN verified | `bvn_verified` |
| `card_active` | Holds a working card | `card_active` |
| `card_premium` | Card is gold or platinum | `card_active`, `card_is_premium` |

Income is issued as **threshold booleans**, not a bracket — "I earn ₦100k+"
reveals one `true`, not which band you're in.

Card templates never expose a card number, expiry or CVV. Linking a card asks
for the **account number**; the bank attests the card works. Those values are
never made into claims, so no commitment exists for them and nothing could
disclose them. It also keeps the system outside PCI-DSS scope.

---

## Repo layout

```
packages/core/           canonical JSON, base64url, crypto, templates, verifyProof
packages/sdk/            PruveVerifier — the public integration surface
packages/issuer-api/     signing, registry lookup, three issuers
packages/verifier-api/   reference verifier: receipts, requests, single-use
packages/developer-api/  hosted verification, API keys
apps/holder/             wallet PWA
apps/verifier/           reference verifier UI
apps/shop/               Campus Store — third-party merchant + inspector
docs/INTEGRATION.md      integration guide
scripts/                 tests, demo tooling, registry + icon generation
```

---

## Testing

```bash
npm run verify:all
```

| Suite | Assertions | Covers |
| --- | --- | --- |
| `npm test` | 42 | Canonical JSON, base64url, Ed25519, commitment hiding, every rejection |
| `npm run smoke` | 19 | Live HTTP — the five demo scenarios and the audit log |
| `npm run test:offline` | 10 | Verification with the issuer dead; cold-start bootstrap |
| `npm run test:shop` | 14 | A third-party merchant verifying in its own process |
| `npm run test:api` | 22 | SDK and hosted REST API, including auth isolation |

Plus `tunnel:test` (the phone path over a live tunnel), `test:link` (shared
links), and `rehearse` (walks the demo printing real payloads).

Demo tooling: `npm run doctor` (preflight + route warming), `npm run
demo:reset` (clear state between takes), `npm run qr-size` (measure real QR
payloads).

---

## Known limits

Stated plainly, because naming what you didn't solve is the difference between
a prototype and a pitch.

- **Mock issuers.** Claims come from a synthetic 200-record registry. No real
  person's data is used or resembled.
- **No revocation.** Only expiry — 1 year for credentials, 5 minutes for
  proofs. Production path is a signed revocation list.
- **Shared links are bearer tokens** for their 5-minute window. The
  QR/request flow binds to a nonce; the link flow trades that for convenience.
- **Salts live in `localStorage`.** A stolen unlocked phone is a wallet
  compromise. Production wants an OS keystore behind biometrics — the one
  genuine argument for a native app.
- **The issuer is still trusted.** Removing it from the verification path
  doesn't remove it from the trust model.
- **Claim-count leakage.** A verifier sees *how many* claims a credential
  holds, just not which.

---

## Why not ZK?

Salted commitments give real minimal disclosure with no proving time and no
WASM toolchain. What a circuit would add is **predicate proofs over hidden
values** — proving `age >= 18` from a concealed date of birth, rather than the
issuer pre-computing an `is_adult` boolean.

That's a genuine upgrade with a precise shape: today the issuer must
anticipate every question. A circuit moves that computation to the holder. The
commitment structure doesn't change, so it slots in behind the same interface.
