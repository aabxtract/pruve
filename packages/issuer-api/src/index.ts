import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import {
  hashDisclosure,
  randomSalt,
  signPayload,
  type CredentialType,
  type Disclosure,
  type SignedCredential,
  type WalletCredential,
} from "@pruve/core";
import { loadKeys } from "./keys.js";
import { bankClaims, cardClaims, nimcClaims } from "./claims.js";
import { findByAccount, findByNin, registrySize, samples } from "./registry.js";

const KEYS = loadKeys();
const YEAR = 60 * 60 * 24 * 365;

const app = new Hono();
app.use("*", cors());

function issue(
  type: CredentialType,
  issuerName: string,
  claims: Record<string, unknown>
): WalletCredential {
  const disclosures: Disclosure[] = Object.entries(claims).map(([k, v]) => [
    randomSalt(),
    k,
    v,
  ]);
  const now = Math.floor(Date.now() / 1000);

  const unsigned: Omit<SignedCredential, "signature"> = {
    id: `cred_${randomUUID()}`,
    type,
    issuer: issuerName,
    issued_at: now,
    expires_at: now + YEAR,
    // Sorted so position reveals nothing about which claim is which.
    claim_hashes: disclosures.map(hashDisclosure).sort(),
  };

  const signature = signPayload(unsigned, KEYS[type].privateKey);
  return { credential: { ...unsigned, signature }, disclosures };
}

app.get("/health", (c) => c.json({ ok: true, service: "issuer", registry: registrySize }));

app.get("/public-keys", (c) =>
  c.json({
    nimc: KEYS.nimc.publicKey,
    bank: KEYS.bank.publicKey,
    card: KEYS.card.publicKey,
  })
);

/** Demo aid: a few real registry records so nobody has to invent a NIN. */
app.get("/samples", (c) => {
  const s = samples();
  const shape = (p: (typeof s)["student"]) => ({
    nin: p.nin,
    account: p.account,
    name: p.name,
    age: p.age,
    bank: p.bank,
    card_ref: p.card_ref,
  });
  return c.json({ minor: shape(s.minor), student: shape(s.student), adult: shape(s.adult) });
});

app.post("/issue/nimc", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const nin = String(body?.nin ?? "");
  if (!/^\d{11}$/.test(nin)) {
    return c.json({ error: "NIN must be 11 digits" }, 400);
  }
  // The NIN looks the holder up and is neither persisted nor logged.
  const { person, exact } = findByNin(nin);
  return c.json({
    ...issue("nimc", "mock-nimc.pruve.ng", nimcClaims(person)),
    subject: { name: person.name, state: person.state, matched: exact },
  });
});

app.post("/issue/bank", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const account = String(body?.account ?? "");
  if (!/^\d{10}$/.test(account)) {
    return c.json({ error: "Account number must be 10 digits" }, 400);
  }
  const { person, exact } = findByAccount(account);
  return c.json({
    ...issue("bank", `mock-${person.bank.toLowerCase().replace(/\s+/g, "")}.pruve.ng`, bankClaims(person)),
    subject: { name: person.name, bank: person.bank, matched: exact },
  });
});

/**
 * Card issuance.
 *
 * Takes the account the card belongs to, never a card number. There is no
 * field here that could carry a PAN, an expiry or a CVV, so none can be
 * committed to and none can ever be disclosed. The bank attests that the card
 * works; Pruve never sees the card.
 */
app.post("/issue/card", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const account = String(body?.account ?? "");
  if (!/^\d{10}$/.test(account)) {
    return c.json({ error: "Enter the 10-digit account the card belongs to" }, 400);
  }
  const { person, exact } = findByAccount(account);
  if (!person.card_active) {
    return c.json({ error: "No active card is linked to that account" }, 409);
  }
  return c.json({
    ...issue("card", `mock-${person.bank.toLowerCase().replace(/\s+/g, "")}-cards.pruve.ng`, cardClaims(person)),
    subject: { name: person.name, bank: person.bank, card_ref: person.card_ref, matched: exact },
  });
});

// There is deliberately no /verify endpoint here. Putting one on the issuer
// would let it observe every verification — who checked what, and when — which
// is the exact surveillance property this architecture exists to remove.

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`Issuer API → http://localhost:${port}`);
