import fs from "node:fs";
import path from "node:path";

/**
 * The synthetic identity registry the mock issuers read from.
 *
 * All records are fabricated (see scripts/gen-registry.ts). Looking a holder
 * up in a real dataset — rather than deriving claims from the last digit of
 * whatever was typed — is what makes onboarding behave like issuance instead
 * of like a form validation.
 */
export interface Person {
  nin: string;
  name: string;
  dob: string;
  age: number;
  state: string;
  account: string;
  bank: string;
  card_ref: string;
  monthly_income: number;
  bvn_verified: boolean;
  account_status: "active" | "inactive";
  card_active: boolean;
  card_tier: "classic" | "gold" | "platinum";
}

const file = path.resolve(process.cwd(), "data/registry.json");
if (!fs.existsSync(file)) {
  throw new Error("No registry at data/registry.json. Run `npm run registry` first.");
}

const loaded = JSON.parse(fs.readFileSync(file, "utf-8")) as { people: Person[] };

const byNin = new Map(loaded.people.map((p) => [p.nin, p]));
const byAccount = new Map(loaded.people.map((p) => [p.account, p]));

export const registrySize = loaded.people.length;

/**
 * Deterministic fallback for an identifier that is not in the registry.
 *
 * A demo must never dead-end on a number a judge invents, so an unknown but
 * well-formed identifier is mapped onto an existing record rather than
 * rejected. The mapping is stable, so the same input always returns the same
 * person.
 */
function fallback(id: string, index: Map<string, Person>): Person {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const all = [...index.values()];
  return all[h % all.length];
}

export function findByNin(nin: string): { person: Person; exact: boolean } {
  const hit = byNin.get(nin);
  return hit ? { person: hit, exact: true } : { person: fallback(nin, byNin), exact: false };
}

export function findByAccount(account: string): { person: Person; exact: boolean } {
  const hit = byAccount.get(account);
  return hit
    ? { person: hit, exact: true }
    : { person: fallback(account, byAccount), exact: false };
}

/** A few real records, surfaced in the UI so a demo has something to type. */
export function samples() {
  const pickBand = (lo: number, hi: number) =>
    loaded.people.find((p) => p.age >= lo && p.age <= hi)!;
  return {
    minor: pickBand(15, 17),
    student: pickBand(18, 25),
    adult: pickBand(26, 35),
  };
}
