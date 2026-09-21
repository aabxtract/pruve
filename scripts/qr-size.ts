/**
 * Measures the real QR payload for each template's link flow.
 *
 * Commitment-based credentials are bigger than plaintext ones, so this is the
 * practical ceiling to watch: past roughly QR version 25 the modules get dense
 * enough that a phone camera struggles at the sizes we render.
 * Run with the issuer up: npx tsx scripts/qr-size.ts
 */
import { TEMPLATES, b64uFromString, type Proof, type WalletCredential } from "@pruve/core";
import { randomUUID } from "node:crypto";

const ISSUER = process.env.ISSUER_URL ?? "http://localhost:3001";
const VERIFIER = process.env.VERIFIER_URL ?? "http://localhost:3002";

// Byte-mode capacity at error-correction level L, which is what react-qr-code
// uses by default.
const CAPACITY: Array<[version: number, bytes: number]> = [
  [5, 106], [10, 271], [15, 520], [20, 858],
  [25, 1273], [30, 1732], [35, 2306], [40, 2953],
];

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function main() {
  const samples = await (await fetch(`${ISSUER}/samples`)).json();
  const nimc = (await (await post(`${ISSUER}/issue/nimc`, { nin: samples.student.nin })).json()) as WalletCredential;
  const bank = (await (await post(`${ISSUER}/issue/bank`, { bvn: samples.student.bvn })).json()) as WalletCredential;

  console.log(
    "template".padEnd(16),
    "shown".padStart(5),
    "json".padStart(6),
    "b64u".padStart(6),
    "url".padStart(6),
    "QR@L".padStart(6)
  );
  console.log("-".repeat(50));

  let worst = 0;
  for (const t of Object.values(TEMPLATES)) {
    const entry = t.credentialType === "nimc" ? nimc : bank;
    const now = Math.floor(Date.now() / 1000);
    const proof: Proof = {
      proof_id: `prf_${randomUUID()}`,
      template: t.id,
      credential: entry.credential,
      disclosures: entry.disclosures.filter(([, k]) => t.reveals.includes(k)),
      generated_at: now,
      expires_at: now + 300,
    };

    const json = JSON.stringify(proof);
    const b64 = b64uFromString(json);
    const url = `${VERIFIER}/verify?proof=${b64}`;
    const version = CAPACITY.find(([, cap]) => cap >= url.length)?.[0] ?? 41;
    worst = Math.max(worst, version);

    console.log(
      t.id.padEnd(16),
      String(proof.disclosures.length).padStart(5),
      String(json.length).padStart(6),
      String(b64.length).padStart(6),
      String(url.length).padStart(6),
      `v${version}`.padStart(6)
    );
  }

  console.log("-".repeat(50));
  const verdict =
    worst <= 20 ? "comfortable at 280px"
    : worst <= 25 ? "fine at 280px, keep the screen bright"
    : worst <= 30 ? "tight — raise QR size or shorten the verifier URL"
    : "too dense for reliable scanning — shorten the payload";
  console.log(`worst case: QR v${worst} — ${verdict}`);
  console.log("note: deployed HTTPS hostnames are longer than localhost; add ~30-40 bytes.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
