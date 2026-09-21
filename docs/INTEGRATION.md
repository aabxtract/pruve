# Integrating Pruve

Ask a customer to prove one fact. Get an answer you can check yourself.

There are two ways in. **Use the SDK if you can run JavaScript** — it is the
one that keeps Pruve out of your request path entirely.

| | `@pruve/sdk` | Developer REST API |
|---|---|---|
| Where verification runs | Your process | Pruve's servers |
| Does Pruve see your customers? | **No** | Yes — every verification |
| Works if Pruve is down? | **Yes** | No |
| Works if the issuer is down? | **Yes**, on cached keys | Yes, on cached keys |
| Needs an API key? | No | Yes |
| Language | TypeScript / JavaScript | Any |

The REST API exists so a PHP or Python backend is not locked out. It is a
convenience that costs privacy, and every response says so in an
`x-pruve-privacy` header.

---

## Option A — the SDK (recommended)

```bash
npm install @pruve/sdk
```

```ts
import { PruveVerifier } from "@pruve/sdk";

const pruve = new PruveVerifier({
  issuerUrl: "https://issuer.pruve.ng",
  verifierId: "campus_store",              // identifies you in the proof
  walletUrl: "https://wallet.pruve.ng",    // where the QR deep-links
  callbackUrl: "https://campusstore.ng/api/pruve", // where the phone posts back
});
```

That is the entire setup. The only network call this object ever makes is
fetching issuer public keys — once, then cached. Everything after is local.

### 1. Ask for a proof

```ts
const request = await pruve.createRequest("ng_under_26", { order: "ORD-1001" });

// request.url  → render this as a QR code
// request.id   → keep it; you will poll on it
```

`metadata` is yours — an order id, a cart, a user row. It comes back untouched.

### 2. Receive the proof

The customer's wallet POSTs to `${callbackUrl}/requests/:id/present`:

```ts
// app/api/pruve/requests/[id]/present/route.ts
export async function POST(req: Request, { params }) {
  const { proof } = await req.json();
  const result = await pruve.verifyPresentation(params.id, proof);

  if (result.valid) {
    // result.disclosed → { is_adult: true, age_band: "18-25", nationality: "NG" }
    // result.receipt_id → keep for your audit log
  }
  return Response.json({ valid: result.valid, reason: result.reason });
}
```

### 3. Show the outcome

Poll your own store, or push over a socket — the SDK holds the result on the
request:

```ts
const req = await pruve.getRequest(id);
if (req?.result?.valid) unlockStudentPricing();
```

### Shared links

For a proof sent over chat or email, there is no request to bind to:

```ts
const proof = PruveVerifier.decodeProof(url.searchParams.get("proof")!);
const result = await pruve.verify(proof);
```

A link proof carries no nonce, so within its five-minute window it is a bearer
token — anyone holding the link can present it. Replay protection still
applies. Use `createRequest` for anything where that matters.

### Running more than one instance

The default stores are in-process. That is correct for one node and wrong for
two: requests become invisible to the instance that did not create them, and
single-use stops being single-use because each node keeps its own idea of what
has been spent. Pass your own:

```ts
new PruveVerifier({
  // ...
  requestStore: new RedisRequestStore(redis),
  replayStore: new RedisReplayStore(redis),
  keyCache:     new RedisKeyCache(redis),
});
```

Implement `RequestStore`, `ReplayStore` and `KeyCache` — three small
interfaces, exported from the package.

---

## Option B — the REST API

Base URL: `https://api.pruve.ng` · Auth: `Authorization: Bearer pk_...`

### `GET /v1/templates`

What a wallet can prove.

```json
{ "templates": [
  { "id": "ng_under_26", "label": "Nigerian, under 26",
    "reveals": ["is_adult", "age_band", "nationality"],
    "hides": ["NIN", "date of birth", "name"] }
]}
```

### `POST /v1/requests`

```bash
curl -X POST https://api.pruve.ng/v1/requests \
  -H "Authorization: Bearer $PRUVE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template":"ng_under_26","metadata":{"order":"ORD-2002"}}'
```

```json
{ "id": "req_e99b5618", "nonce": "…", "url": "https://wallet.pruve.ng/share?…",
  "expires_at": 1789990000 }
```

Render `url` as a QR.

### `POST /v1/requests/:id/present`

The wallet calls this. **No API key** — the nonce is the authorisation.

### `GET /v1/requests/:id`

```json
{ "status": "complete",
  "result": { "valid": true, "disclosed": { "is_adult": true }, "receipt_id": "rcpt_…" },
  "metadata": { "order": "ORD-2002" } }
```

### `POST /v1/verify`

For shared links. Accepts a decoded object or the raw `?proof=` string.

### `GET /v1/public-keys`

The issuer keys, so you can stop using this API and verify locally. Handing
these out is the point.

### Errors

| Status | `code` | Meaning |
|---|---|---|
| 400 | `unknown_template` | No such template |
| 400 | `template_mismatch` | Proof does not answer the request |
| 400 | `invalid_proof` | Could not decode |
| 401 | — | Missing or wrong API key |
| 404 | `unknown_request` | Expired or never existed |
| 409 | `already_answered` | This request was already used |

---

## What you get, and what you do not

A successful verification gives you `disclosed` — only the fields the template
names — plus an issuer and a receipt id.

You do not get a name, a NIN, a date of birth, an account number or a card
number. Not because they are filtered on the way out, but because they were
never in the proof: the credential carries hashed commitments, and only the
fields the customer chose to open are readable at all.

That is the part worth designing around. **Store the receipt id and the
outcome, not the values.** A `disclosed` payload is still personal data; a
receipt id is not.

## Templates

| Template | Proves | Reveals |
|---|---|---|
| `i_am_adult` | 18 or older | `is_adult` |
| `ng_under_26` | Nigerian, 18–25 | `is_adult`, `age_band`, `nationality` |
| `i_earn_enough` | Earns ₦100k+/month, active account | `account_status`, `income_at_least_100k` |
| `i_am_verified` | BVN verified | `bvn_verified` |
| `card_active` | Holds a working debit card | `card_active` |
| `card_premium` | Card is gold or platinum | `card_active`, `card_is_premium` |

Card templates never expose a card number, expiry or CVV — those are not
claims, so no commitment exists for them and they cannot be disclosed.
