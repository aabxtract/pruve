/**
 * Walks the exact path a phone takes, through the live tunnel.
 *
 * Everything else in this repo tests localhost. This is the only script that
 * proves the demo works from a device that is not this machine: it discovers
 * the tunnel from ngrok's local API, then issues, presents and verifies using
 * only public URLs.
 *
 * Run with ngrok up: npm run tunnel:test
 */
import { TEMPLATES, type Proof, type WalletCredential } from "@pruve/core";
import { randomUUID } from "node:crypto";

const LOCAL_API = "http://localhost:3003";

let fails = 0;
const ok = (m: string, d = "") => console.log(`  ✓  ${m}${d ? `  ${d}` : ""}`);
const bad = (m: string, d = "") => { fails++; console.log(`  ✗  ${m}${d ? `  ${d}` : ""}`); };
const head = (t: string) => console.log(`\n${t}`);

// A real phone, so nothing can pass by looking like a script.
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const asPhone = (url: string, init: RequestInit = {}) =>
  fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30000),
    headers: {
      "User-Agent": PHONE_UA,
      "ngrok-skip-browser-warning": "true",
      ...(init.headers ?? {}),
    },
  });

const phonePost = (url: string, body: unknown) =>
  asPhone(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  console.log("Tunnel path test — simulating the phone");

  const TUNNEL = await discoverTunnel();
  if (!TUNNEL) {
    console.error("\n  No tunnel found. Start one (`ngrok http 3000`) or set TUNNEL_URL.\n");
    process.exitCode = 1;
    return;
  }
  console.log(`  tunnel: ${TUNNEL}`);

  // --------------------------------------------------- 1. wallet loads
  head("1. Phone opens the wallet");
  const home = await asPhone(`${TUNNEL}/`);
  const html = await home.text();
  if (home.status === 200 && html.includes("Pruve")) ok("wallet HTML served over the tunnel");
  else bad(`wallet did not load (status ${home.status})`, html.slice(0, 80));
  if (!/ngrok|You are about to visit/i.test(html)) ok("no interstitial in the way");
  else bad("ngrok interstitial served instead of the app", "tap through it once on the device");

  // ------------------------------------------- 2. PWA assets over tunnel
  head("2. PWA assets");
  for (const p of ["/manifest.webmanifest", "/icon-192.png", "/sw.js"]) {
    const r = await asPhone(`${TUNNEL}${p}`);
    r.status === 200 ? ok(p) : bad(`${p} → ${r.status}`);
  }

  // --------------------------------- 3. issuance through the proxy
  head("3. Wallet links a credential (proxied issuer)");
  const issueRes = await phonePost(`${TUNNEL}/api/issuer/issue/nimc`, { nin: "12345678903" });
  const ctype = issueRes.headers.get("content-type") ?? "";
  if (!ctype.includes("application/json")) {
    bad("issuer returned non-JSON through the tunnel", ctype);
    console.log(`       body: ${(await issueRes.text()).slice(0, 120)}`);
    console.log(`\n  ${fails} failure(s) — stopping.\n`);
    process.exitCode = 1;
    return;
  }
  const entry = (await issueRes.json()) as WalletCredential;
  ok("credential issued over the tunnel", entry.credential.id.slice(0, 20) + "…");
  if (!JSON.stringify(entry.credential).includes("18-25")) ok("credential still carries no claim values");
  else bad("claim values leaked into the signed credential");

  // ------------------------------- 4. verifier raises a request (laptop)
  head("4. Verifier asks for a proof");
  const req = await (
    await fetch(`${LOCAL_API}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "i_am_adult", verifier_id: "pruve_demo_venue" }),
    })
  ).json();
  ok("request created", req.id);

  const deepLink =
    `${TUNNEL}/share?template=i_am_adult&rid=${req.id}&nonce=${req.nonce}` +
    `&aud=pruve_demo_venue&api=${encodeURIComponent(`${TUNNEL}/api/verifier`)}`;
  console.log(`       QR encodes ${deepLink.length} bytes`);

  // ------------------------------ 5. phone opens the deep link from the QR
  head("5. Phone camera opens the QR deep link");
  const share = await asPhone(deepLink);
  share.status === 200 ? ok("share screen loads over the tunnel") : bad(`share screen → ${share.status}`);

  // ------------------------------ 6. phone presents through the proxy
  head("6. Phone sends the proof (proxied verifier API)");
  const t = TEMPLATES.i_am_adult;
  const now = Math.floor(Date.now() / 1000);
  const proof: Proof = {
    proof_id: `prf_tunnel_${randomUUID()}`,
    template: "i_am_adult",
    credential: entry.credential,
    disclosures: entry.disclosures.filter(([, k]) => t.reveals.includes(k)),
    nonce: req.nonce,
    audience: "pruve_demo_venue",
    generated_at: now,
    expires_at: now + 300,
  };
  const presented = await phonePost(`${TUNNEL}/api/verifier/requests/${req.id}/present`, { proof });
  const result = await presented.json();
  result.valid ? ok("proof accepted", result.receipt_id) : bad("proof rejected", result.reason);
  if (JSON.stringify(result.disclosed) === '{"is_adult":true}') ok("disclosed exactly one field");
  else bad("wrong disclosure", JSON.stringify(result.disclosed));

  // ------------------------------ 7. laptop verifier sees it
  head("7. Verifier screen flips green");
  const poll = await (await fetch(`${LOCAL_API}/requests/${req.id}`)).json();
  poll.status === "complete" && poll.result?.valid
    ? ok("poll returns complete + valid")
    : bad("verifier never saw the result", JSON.stringify(poll).slice(0, 100));

  console.log(
    `\n${fails === 0 ? "PHONE PATH WORKS — record with confidence" : `PHONE PATH BROKEN — ${fails} failure(s)`}\n`
  );
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((e) => { console.error("tunnel test crashed:", e); process.exitCode = 1; });
