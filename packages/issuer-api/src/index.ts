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
import { findByBvn, findByCard, findByNin, registrySize, samples } from "./registry.js";

/** Luhn checksum — the same check a payment terminal runs. */
function luhn(pan: string): boolean {
  let sum = 0;
  const rev = [...pan].reverse();
  for (let i = 0; i < rev.length; i++) {
    let d = Number(rev[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

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
    bvn: p.bvn,
    card_number: p.card_number,
    card_expiry: p.card_expiry,
    card_cvv: p.card_cvv,
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
  const bvn = String(body?.bvn ?? "");
  if (!/^\d{11}$/.test(bvn)) {
    return c.json({ error: "BVN must be 11 digits" }, 400);
  }
  // The BVN identifies the holder across every bank they use, and is neither
  // persisted nor logged.
  const { person, exact } = findByBvn(bvn);
  return c.json({
    ...issue("bank", `mock-${person.bank.toLowerCase().replace(/\s+/g, "")}.pruve.ng`, bankClaims(person)),
    subject: { name: person.name, bank: person.bank, matched: exact },
  });
});

/**
 * Card issuance.
 *
 * Takes the full card details, validates them, and then DROPS them. Nothing
 * from the PAN, expiry or CVV is persisted, logged, or turned into a claim —
 * the only things committed to are `card_active`, `card_is_premium` and the
 * issuing bank. The number exists in this handler's scope and nowhere else.
 */
app.post("/issue/card", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const pan = String(body?.card_number ?? "").replace(/\s|-/g, "");
  const expiry = String(body?.expiry ?? "");
  const cvv = String(body?.cvv ?? "");

  if (!/^\d{13,19}$/.test(pan) || !luhn(pan)) {
    return c.json({ error: "That card number is not valid" }, 400);
  }
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
    return c.json({ error: "Expiry must be MM/YY" }, 400);
  }
  if (!/^\d{3,4}$/.test(cvv)) {
    return c.json({ error: "CVV must be 3 or 4 digits" }, 400);
  }
  const [mm, yy] = expiry.split("/").map(Number);
  const now = new Date();
  if (2000 + yy < now.getFullYear() || (2000 + yy === now.getFullYear() && mm < now.getMonth() + 1)) {
    return c.json({ error: "That card has expired" }, 409);
  }

  const { person, exact } = findByCard(pan);
  if (!person.card_active) {
    return c.json({ error: "That card is not active" }, 409);
  }

  const credential = issue(
    "card",
    `mock-${person.bank.toLowerCase().replace(/\s+/g, "")}-cards.pruve.ng`,
    cardClaims(person)
  );

  // pan, expiry and cvv go out of scope here and are never written anywhere.
  return c.json({
    ...credential,
    subject: {
      name: person.name,
      bank: person.bank,
      card_ref: `•••• ${pan.slice(-4)}`,
      matched: exact,
    },
    discarded: ["card_number", "expiry", "cvv"],
  });
});

// There is deliberately no /verify endpoint here. Putting one on the issuer
// would let it observe every verification — who checked what, and when — which
// is the exact surveillance property this architecture exists to remove.

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`Issuer API → http://localhost:${port}`);
