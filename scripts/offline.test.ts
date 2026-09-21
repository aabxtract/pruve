/**
 * Proves the headline architectural claim: verification does not need the issuer.
 *
 * Starts a second verifier-api pointed at a dead issuer URL, so it must fall
 * back to its cached public keys, then verifies a real proof against it.
 * Run with the normal stack up: npx tsx scripts/offline.test.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TEMPLATES, type Proof, type WalletCredential } from "@pruve/core";

const ISSUER = "http://localhost:3001";
const OFFLINE_PORT = 3013;
const DEAD_ISSUER = "http://127.0.0.1:9";
const apiDir = path.resolve(import.meta.dirname, "../packages/verifier-api");

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

function buildProof(entry: WalletCredential, id: keyof typeof TEMPLATES): Proof {
  const t = TEMPLATES[id];
  const now = Math.floor(Date.now() / 1000);
  return {
    proof_id: `prf_offline_${Math.random().toString(36).slice(2)}`,
    template: id,
    credential: entry.credential,
    disclosures: entry.disclosures.filter(([, k]) => t.reveals.includes(k)),
    generated_at: now,
    expires_at: now + 300,
  };
}

const waitFor = async (url: string, ms = 20000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(800) })).ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

async function main() {
  // 1. Get a real credential and proof from the live issuer, while it is up.
  const entry = (await (
    await fetch(`${ISSUER}/issue/nimc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nin: "12345678903" }),
    })
  ).json()) as WalletCredential;
  const proof = buildProof(entry, "i_am_adult");
  console.log("Setup");
  check("issued a credential while the issuer was reachable", !!entry.credential.signature);

  // 2. Boot a verifier-api that CANNOT reach any issuer.
  console.log("\nVerifier with issuer unreachable");
  // Spawn node directly with the tsx loader — no shell. Going through `npx`
  // with shell:true on Windows gives you a shell as the child, so stdout never
  // reaches these pipes and kill() reaps the wrapper while tsx keeps the
  // SQLite file locked.
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts"],
    {
      cwd: apiDir,
      env: {
        ...process.env,
        ISSUER_URL: DEAD_ISSUER,
        PORT: String(OFFLINE_PORT),
        DB_PATH: "offline-test.db",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));

  try {
    const OFFLINE = `http://localhost:${OFFLINE_PORT}`;
    check("offline verifier booted", await waitFor(`${OFFLINE}/health`), log.slice(-400));

    const res = await (
      await fetch(`${OFFLINE}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof, verifier_id: "offline_venue" }),
      })
    ).json();

    check("proof still verifies with no issuer reachable", res.valid === true, res.reason);
    check("still discloses only is_adult", JSON.stringify(res.disclosed) === '{"is_adult":true}');
    check("receipt still written locally", typeof res.receipt_id === "string");

    // The child logs the cache fallback on its first key load; give the pipe a
    // moment to reach us before asserting on it.
    await new Promise((r) => setTimeout(r, 400));
    check("it used the cached keys, not the network", /cached public keys/i.test(log), log.slice(-300));
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 600));
  }

  // 3. Fresh-clone bootstrap: no cached keys, ISSUER_URL supplied only by the
  //    committed .env. This is the path that was silently broken — nothing
  //    loaded .env, so ISSUER_URL was undefined and the service could only
  //    ever run off a stale cache it had no way to create.
  console.log("\nFresh bootstrap from .env (no cached keys)");
  const cache = path.join(apiDir, ".pubkeys.json");
  const backup = `${cache}.bak`;
  const hadCache = fs.existsSync(cache);
  if (hadCache) fs.renameSync(cache, backup);

  const fresh = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: apiDir,
    // Deliberately NOT passing ISSUER_URL: it must come from .env.
    env: { ...process.env, ISSUER_URL: undefined, PORT: "3014", DB_PATH: "bootstrap-test.db" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let freshLog = "";
  fresh.stdout.on("data", (d) => (freshLog += d));
  fresh.stderr.on("data", (d) => (freshLog += d));

  try {
    check("booted with no cached keys", await waitFor("http://localhost:3014/health"), freshLog.slice(-400));

    const res = await (
      await fetch("http://localhost:3014/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: buildProof(entry, "ng_under_26"), verifier_id: "bootstrap" }),
      })
    ).json();

    await new Promise((r) => setTimeout(r, 400));
    check("verifies on a cold start", res.valid === true, res.reason);
    check("fetched keys from the issuer, not a cache", /refreshed from issuer/i.test(freshLog), freshLog.slice(-300));
    check("wrote the key cache for next time", fs.existsSync(cache));
  } finally {
    fresh.kill();
    await new Promise((r) => setTimeout(r, 600));
    try { fs.rmSync(path.join(apiDir, "bootstrap-test.db"), { force: true }); } catch {}
    if (hadCache) { try { fs.rmSync(cache, { force: true }); fs.renameSync(backup, cache); } catch {} }
  }

  console.log(`\n${failed === 0 ? "OFFLINE ALL PASSED" : "OFFLINE FAILURES"} — ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => { console.error("crashed:", e); process.exitCode = 1; });
