import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * API key management for hosted verification.
 *
 * Keys are stored hashed-at-rest would be the production answer; for a
 * prototype they are stored in a gitignored file and compared in constant
 * time. What matters architecturally is that a key scopes a merchant: every
 * request, request-store entry and replay registry is namespaced by it, so
 * two merchants cannot see or spend each other's proofs.
 */
export interface ApiClient {
  key: string;
  name: string;
  created: string;
}

const FILE = path.resolve(process.cwd(), ".api-keys.json");

function load(): ApiClient[] {
  if (!fs.existsSync(FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

function save(clients: ApiClient[]) {
  fs.writeFileSync(FILE, JSON.stringify(clients, null, 2));
}

let clients = load();

/** Seeds a demo key on first boot so the API is usable immediately. */
export function ensureSeed(): ApiClient {
  const existing = clients.find((c) => c.name === "demo");
  if (existing) return existing;
  const demo: ApiClient = {
    key: `pk_test_${randomBytes(18).toString("hex")}`,
    name: "demo",
    created: new Date().toISOString(),
  };
  clients = [...clients, demo];
  save(clients);
  return demo;
}

export function createClient(name: string): ApiClient {
  const client: ApiClient = {
    key: `pk_live_${randomBytes(18).toString("hex")}`,
    name,
    created: new Date().toISOString(),
  };
  clients = [...clients, client];
  save(clients);
  return client;
}

export function authenticate(header: string | undefined): ApiClient | null {
  if (!header) return null;
  const presented = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(presented);

  for (const c of clients) {
    const b = Buffer.from(c.key);
    // Compare in constant time, and only when lengths match — timingSafeEqual
    // throws on a length mismatch, which would itself leak length.
    if (a.length === b.length && timingSafeEqual(a, b)) return c;
  }
  return null;
}

export const clientCount = () => clients.length;
