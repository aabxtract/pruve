/**
 * Discovers the current ngrok tunnel and rewrites the env files to match.
 *
 * Tunnel URLs change every time the agent restarts, and three settings across
 * two apps depend on them. Doing that by hand mid-session is how you end up
 * recording a take where the QR scans and the proof never arrives.
 *
 * Run: npm run tunnel:wire
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

async function tunnelUrl(): Promise<string | null> {
  if (process.env.TUNNEL_URL) return process.env.TUNNEL_URL;
  try {
    const r = await fetch("http://localhost:4040/api/tunnels", { signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { tunnels: Array<{ public_url: string; proto: string }> };
    return j.tunnels.find((t) => t.proto === "https")?.public_url ?? null;
  } catch {
    return null;
  }
}

/** Replaces KEY=... lines, appending any that are missing. */
function writeEnv(rel: string, updates: Record<string, string>, header: string) {
  const p = path.join(root, rel);
  const existing = fs.existsSync(p) ? fs.readFileSync(p, "utf-8").split(/\r?\n/) : [];
  const seen = new Set<string>();

  const out = existing.map((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return line;
    const eq = t.indexOf("=");
    if (eq < 0) return line;
    const key = t.slice(0, eq).trim();
    if (key in updates) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }

  const body = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  fs.writeFileSync(p, existing.length ? body : `${header}\n${body}`);
  console.log(`  wrote ${rel}`);
  for (const [k, v] of Object.entries(updates)) console.log(`    ${k}=${v}`);
}

async function main() {
  const url = await tunnelUrl();
  if (!url) {
    console.error("\n  No ngrok tunnel found on :4040.");
    console.error("  Start one with `ngrok http 3000`, or set TUNNEL_URL.\n");
    process.exitCode = 1;
    return;
  }

  console.log(`Tunnel: ${url}\n`);

  // The wallet talks to both backends through its own origin, so it needs no
  // absolute URLs at all — only the link-flow base, which is laptop-local.
  writeEnv(
    "apps/holder/.env.local",
    {
      NEXT_PUBLIC_ISSUER_URL: "/api/issuer",
      NEXT_PUBLIC_VERIFIER_API_URL: "/api/verifier",
    },
    "# Both backends are proxied through this app (see next.config.mjs).\n"
  );

  // Only the two values the PHONE reads out of the QR become tunnel URLs.
  writeEnv(
    "apps/verifier/.env.local",
    {
      NEXT_PUBLIC_HOLDER_URL: url,
      NEXT_PUBLIC_VERIFIER_API_PUBLIC_URL: `${url}/api/verifier`,
    },
    "# Laptop-local for its own calls; tunnel URLs for anything the phone reads.\n"
  );

  console.log("\n  Next dev reloads .env automatically — give it ~10s, then:");
  console.log("    npm run doctor");
  console.log("    npm run tunnel:test");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
