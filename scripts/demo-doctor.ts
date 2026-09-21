/**
 * Pre-recording preflight. Run this before every take.
 *
 * The failure that ruins a demo is never the crypto — it is a URL mismatch:
 * the verifier's QR pointing at localhost while the phone is on a tunnel, or a
 * Next app still serving a build that inlined the previous tunnel URL.
 * This catches all of that in about two seconds.
 *
 * Run: npm run doctor
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TEMPLATES, type Proof, type WalletCredential } from "@pruve/core";

const root = path.resolve(import.meta.dirname, "..");

let problems = 0;
let warnings = 0;
const ok = (m: string, d = "") => console.log(`  ✓  ${m}${d ? `  ${d}` : ""}`);
const bad = (m: string, fix: string) => { problems++; console.log(`  ✗  ${m}\n       fix: ${fix}`); };
const warn = (m: string, d = "") => { warnings++; console.log(`  !  ${m}${d ? `\n       ${d}` : ""}`); };
const head = (t: string) => console.log(`\n${t}`);

function readEnv(rel: string): Record<string, string> {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const isLocal = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(u);

/**
 * A tunnel round-trip is laptop → ngrok edge → back to laptop, which routinely
 * takes several seconds on the first hit, so remote URLs get a far longer
 * budget than local ones. The ngrok header stops the free-tier interstitial
 * answering with an HTML warning page where we expect a real response.
 */
const reach = async (url: string, ms?: number): Promise<number | null> => {
  const budget = ms ?? (isLocal(url) || url.startsWith("/") ? 5000 : 25000);
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(budget),
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    return r.status;
  } catch {
    return null;
  }
};
const isRelative = (u: string) => u.startsWith("/");

async function main() {
  console.log("Pruve demo doctor");

  const holderEnv = readEnv("apps/holder/.env.local");
  const verifierEnv = readEnv("apps/verifier/.env.local");
  const apiEnv = readEnv("packages/verifier-api/.env");

  const HOLDER_ORIGIN = verifierEnv.NEXT_PUBLIC_HOLDER_URL ?? "http://localhost:3000";
  const VERIFIER_ORIGIN = holderEnv.NEXT_PUBLIC_VERIFIER_URL ?? "http://localhost:3002";
  const API_LOCAL = verifierEnv.NEXT_PUBLIC_VERIFIER_API_URL ?? "http://localhost:3003";
  const API_FOR_PHONE = verifierEnv.NEXT_PUBLIC_VERIFIER_API_PUBLIC_URL || API_LOCAL;
  const ISSUER_FROM_WALLET = holderEnv.NEXT_PUBLIC_ISSUER_URL ?? "http://localhost:3001";

  // ------------------------------------------------------------- services
  head("Services");
  for (const [name, url] of [
    ["issuer api", "http://localhost:3001/health"],
    ["verifier api", "http://localhost:3003/health"],
    ["developer api", "http://localhost:3006/health"],
    ["holder web", "http://localhost:3000/"],
    ["verifier web", "http://localhost:3002/"],
    ["campus store", "http://localhost:3005/"],
  ] as const) {
    const s = await reach(url);
    if (s === 200) ok(name);
    else bad(`${name} not responding (${url})`, "npm run dev");
  }

  // ----------------------------------------------------------------- env
  head("Wiring");

  // Wallet -> issuer. Relative means it goes through the holder's own proxy.
  if (isRelative(ISSUER_FROM_WALLET)) {
    const s = await reach(`http://localhost:3000${ISSUER_FROM_WALLET}/health`);
    if (s === 200) ok("wallet reaches issuer through its own proxy", ISSUER_FROM_WALLET);
    else bad(`wallet proxy ${ISSUER_FROM_WALLET} is not forwarding`, "check rewrites in apps/holder/next.config.mjs, then restart the holder");
  } else {
    const s = await reach(`${ISSUER_FROM_WALLET}/health`);
    if (s === 200) ok("wallet reaches issuer directly", ISSUER_FROM_WALLET);
    else bad(`wallet cannot reach issuer at ${ISSUER_FROM_WALLET}`, "fix NEXT_PUBLIC_ISSUER_URL in apps/holder/.env.local");
  }

  // Verifier -> its own API
  if ((await reach(`${API_LOCAL}/health`)) === 200) ok("verifier reaches its API", API_LOCAL);
  else bad(`verifier cannot reach its API at ${API_LOCAL}`, "fix NEXT_PUBLIC_VERIFIER_API_URL in apps/verifier/.env.local");

  // The QR's phone-facing API URL
  const phoneApiHealth = isRelative(API_FOR_PHONE)
    ? await reach(`${HOLDER_ORIGIN}${API_FOR_PHONE}/health`)
    : await reach(`${API_FOR_PHONE}/health`);
  if (phoneApiHealth === 200) ok("QR's verifier-API URL resolves", API_FOR_PHONE);
  else bad(`the URL baked into the QR is unreachable: ${API_FOR_PHONE}`, "set NEXT_PUBLIC_VERIFIER_API_PUBLIC_URL in apps/verifier/.env.local");

  if ((await reach(HOLDER_ORIGIN)) === 200) ok("QR's wallet URL resolves", HOLDER_ORIGIN);
  else bad(`the wallet URL in the QR is unreachable: ${HOLDER_ORIGIN}`, "fix NEXT_PUBLIC_HOLDER_URL in apps/verifier/.env.local");

  if (!apiEnv.ISSUER_URL) warn("packages/verifier-api/.env has no ISSUER_URL", "cold start will fail without a cached .pubkeys.json");

  // ------------------------------------------------- the mismatch check
  head("Phone reachability");
  const phoneFacing = { "wallet (QR target)": HOLDER_ORIGIN, "verifier API (QR param)": API_FOR_PHONE };
  const localOnes = Object.entries(phoneFacing).filter(([, u]) => isLocal(u) && !isRelative(u));

  if (localOnes.length === 0) {
    ok("every phone-facing URL is externally reachable");
  } else if (localOnes.length === Object.keys(phoneFacing).length) {
    warn(
      "all phone-facing URLs are localhost — laptop-only demo",
      "Fine for screen recording on one machine. For a real phone, tunnel the\n       wallet and set NEXT_PUBLIC_HOLDER_URL + NEXT_PUBLIC_VERIFIER_API_PUBLIC_URL."
    );
  } else {
    bad(
      `MIXED: ${localOnes.map(([k]) => k).join(", ")} still on localhost while others are public`,
      "a phone will fail at exactly that step — make them all tunnel URLs"
    );
  }

  // The link flow now builds its URL from the wallet's own origin at runtime,
  // so it is reachable exactly when the wallet is — no separate env value to
  // drift out of sync, and no second tunnel needed.
  const linkFlow = `${HOLDER_ORIGIN}/verify`;
  const linkStatus = await reach(linkFlow);
  if (linkStatus !== 200) {
    bad(`shared-link page unreachable: ${linkFlow}`, "the /verify route lives in the wallet app");
  } else if (isLocal(HOLDER_ORIGIN)) {
    warn("shared links will point at localhost", "openable only on this machine until you tunnel the wallet");
  } else {
    ok("shared links are externally openable", linkFlow);
  }
  void VERIFIER_ORIGIN;

  // ---------------------------------------------------------- live round trip
  head("Live round trip");
  try {
    const post = (u: string, b: unknown) =>
      fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

    const entry = (await (await post("http://localhost:3001/issue/nimc", { nin: "12345678903" })).json()) as WalletCredential;
    const req = await (await post("http://localhost:3003/requests", { template: "i_am_adult", verifier_id: "doctor" })).json();
    const t = TEMPLATES.i_am_adult;
    const now = Math.floor(Date.now() / 1000);
    const proof: Proof = {
      proof_id: `prf_doctor_${randomUUID()}`,
      template: "i_am_adult",
      credential: entry.credential,
      disclosures: entry.disclosures.filter(([, k]) => t.reveals.includes(k)),
      nonce: req.nonce,
      audience: "doctor",
      generated_at: now,
      expires_at: now + 300,
    };
    const res = await (await post(`http://localhost:3003/requests/${req.id}/present`, { proof })).json();
    if (res.valid) ok("issue → request → present → verified");
    else bad(`round trip failed: ${res.reason}`, "run npm run verify:all for detail");
  } catch (e) {
    bad(`round trip threw: ${e instanceof Error ? e.message : e}`, "run npm run verify:all");
  }

  // ------------------------------------------------------------ PWA assets
  head("PWA assets");
  for (const p of ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/sw.js"]) {
    if ((await reach(`http://localhost:3000${p}`)) === 200) ok(p);
    else bad(`${p} missing`, "npm run icons");
  }
  if (isLocal(HOLDER_ORIGIN)) warn("PWA install needs HTTPS", "on localhost you get the service worker but no install prompt");

  // ---------------------------------------------------------- warm routes
  // Next dev compiles each route on first request, so a page nobody has opened
  // yet stalls for seconds — on a phone that reads as "the app is broken".
  // Touch every route now so the first hit on camera is the warm one.
  head("Warming routes");
  const routes = [
    [HOLDER_ORIGIN, "/"],
    [HOLDER_ORIGIN, "/onboard/nimc"],
    [HOLDER_ORIGIN, "/onboard/bank"],
    [HOLDER_ORIGIN, "/share?template=i_am_adult"],
    [HOLDER_ORIGIN, "/share?template=i_earn_enough"],
    [HOLDER_ORIGIN, "/onboard/card"],
    ["http://localhost:3002", "/"],
    ["http://localhost:3002", "/verify"],
    ["http://localhost:3005", "/"],
  ] as const;

  let slowest = 0;
  for (const [origin, route] of routes) {
    const t0 = Date.now();
    const s = await reach(`${origin}${route}`, 60000);
    const ms = Date.now() - t0;
    slowest = Math.max(slowest, ms);
    if (s === 200) console.log(`  ✓  ${route.padEnd(30)} ${ms}ms`);
    else bad(`${route} → ${s ?? "no response"}`, "check the dev server output");
  }

  if (slowest > 2500) {
    warn(
      `slowest cold compile was ${slowest}ms`,
      "Dev mode compiles per route. For recording, run production builds instead:\n" +
        "       npm -w holder run build && npm -w holder run start\n" +
        "       npm -w verifier run build && npm -w verifier run start"
    );
  } else {
    ok("all routes warm", `slowest ${slowest}ms`);
  }

  // ------------------------------------------------------------------ done
  console.log(
    `\n${problems === 0 ? "READY TO RECORD" : "NOT READY"} — ${problems} problem(s), ${warnings} warning(s)\n`
  );
  process.exitCode = problems === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
