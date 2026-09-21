/**
 * Tests the shared-link flow (Telegram / copied link) over the live tunnel.
 *
 * This is the path a landlord takes: they receive a link in a chat app, open
 * it on a device that has never touched this system, and get an answer. It is
 * the flow most likely to break silently, because it is the only one where the
 * recipient's browser is not the machine running the stack.
 *
 * Run with ngrok up: npm run test:link
 */
import { TEMPLATES, b64uFromString, stringFromB64u, type Proof, type WalletCredential } from "@pruve/core";
import { randomUUID } from "node:crypto";

let fails = 0;
const ok = (m: string, d = "") => console.log(`  ✓  ${m}${d ? `  ${d}` : ""}`);
const bad = (m: string, d = "") => { fails++; console.log(`  ✗  ${m}${d ? `  ${d}` : ""}`); };
const head = (t: string) => console.log(`\n${t}`);

// A recipient's phone — not the machine running the stack.
const RECIPIENT_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

const asRecipient = (url: string, init: RequestInit = {}) =>
  fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30000),
    headers: {
      "User-Agent": RECIPIENT_UA,
      "ngrok-skip-browser-warning": "true",
      ...(init.headers ?? {}),
    },
  });

async function discoverTunnel(): Promise<string | null> {
  if (process.env.TUNNEL_URL) return process.env.TUNNEL_URL;
  try {
    const r = await fetch("http://localhost:4040/api/tunnels", { signal: AbortSignal.timeout(4000) });
    const j = (await r.json()) as { tunnels: Array<{ public_url: string; proto: string }> };
    return j.tunnels.find((t) => t.proto === "https")?.public_url ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("Link flow test — Telegram / shared link");

  const TUNNEL = await discoverTunnel();
  if (!TUNNEL) {
    console.error("\n  No tunnel found. Start `ngrok http 3000` or set TUNNEL_URL.\n");
    process.exitCode = 1;
    return;
  }
  console.log(`  tunnel: ${TUNNEL}`);

  // 1. Holder gets a bank credential and builds an income proof.
  head("1. Holder generates a shareable proof");
  const entry = (await (
    await asRecipient(`${TUNNEL}/api/issuer/issue/bank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: "1234567893" }),
    })
  ).json()) as WalletCredential;
  ok("bank credential issued");

  const t = TEMPLATES.i_earn_enough;
  const now = Math.floor(Date.now() / 1000);
  const proof: Proof = {
    proof_id: `prf_link_${randomUUID()}`,
    template: "i_earn_enough",
    credential: entry.credential,
    disclosures: entry.disclosures.filter(([, k]) => t.reveals.includes(k)),
    generated_at: now,
    expires_at: now + 300,
  };

  const encoded = b64uFromString(JSON.stringify(proof));
  const link = `${TUNNEL}/verify?proof=${encoded}`;
  ok("link built", `${link.length} bytes`);

  if (!/[+/]/.test(encoded)) ok("base64url — no '+' or '/' to be mangled in a query string");
  else bad("payload contains raw base64 characters");

  // 2. The Telegram share URL the button opens.
  head("2. Telegram share URL");
  const tg =
    `https://t.me/share/url?url=${encodeURIComponent(link)}` +
    `&text=${encodeURIComponent("Verify my identity — this link expires in 5 minutes and works once.")}`;
  const parsed = new URL(tg);
  const roundTripped = parsed.searchParams.get("url");
  if (roundTripped === link) ok("link survives Telegram's url parameter intact");
  else bad("link mangled by the share URL", String(roundTripped).slice(0, 80));
  console.log(`       ${tg.slice(0, 96)}…`);

  // 3. Recipient opens it cold.
  head("3. Recipient opens the link");
  const page = await asRecipient(link);
  const html = await page.text();
  if (page.status === 200) ok("verify page served over the tunnel");
  else bad(`verify page → ${page.status}`);
  if (html.includes("Pruve Verify")) ok("it is the verification page");
  else bad("wrong page content", html.slice(0, 80));

  // The proof must survive the round trip through a real URL parser.
  const back = new URL(link).searchParams.get("proof")!;
  const decoded = JSON.parse(stringFromB64u(back)) as Proof;
  if (decoded.proof_id === proof.proof_id) ok("proof decodes intact from the URL");
  else bad("proof corrupted in transit");

  // 4. What the recipient's browser then does.
  head("4. Verification, as the recipient's browser performs it");
  const keys = await (await asRecipient(`${TUNNEL}/api/issuer/public-keys`)).json();
  ok("public keys fetched", "cached in localStorage after this");

  const res = await (
    await asRecipient(`${TUNNEL}/api/verifier/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof: decoded, verifier_id: "landlord_demo" }),
    })
  ).json();

  res.valid ? ok("proof accepted", res.receipt_id) : bad("proof rejected", res.reason);
  if (JSON.stringify(res.disclosed) === '{"account_status":"active","income_at_least_100k":true}') {
    ok("discloses threshold only");
  } else bad("unexpected disclosure", JSON.stringify(res.disclosed));
  if (!JSON.stringify(res).includes("500k")) ok("income bracket never revealed");
  else bad("income bracket leaked");
  void keys;

  // 5. Single use.
  head("5. Replay");
  const again = await (
    await asRecipient(`${TUNNEL}/api/verifier/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof: decoded, verifier_id: "landlord_demo" }),
    })
  ).json();
  if (!again.valid && (again.reason ?? "").includes("already been used")) ok("second open rejected", again.reason);
  else bad("replay not blocked", JSON.stringify(again).slice(0, 80));

  console.log(`\n${fails === 0 ? "LINK FLOW WORKS" : `LINK FLOW BROKEN — ${fails} failure(s)`}\n`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((e) => { console.error("link flow test crashed:", e); process.exitCode = 1; });
