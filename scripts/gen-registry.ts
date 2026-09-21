/**
 * Generates the synthetic identity registry the mock issuers read from.
 *
 * ALL DATA IS FABRICATED. The NINs, account numbers and card references are
 * generated from a fixed seed so the set is reproducible, and they are not
 * drawn from, checked against, or intended to resemble any real person's
 * records. The issuers are mocks standing in for NIMC and a bank.
 *
 * Run: npm run registry
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../packages/issuer-api/data/registry.json");

/** Deterministic PRNG so the registry is identical on every machine. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260921);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const FIRST = [
  "Tunde", "Chiamaka", "Emeka", "Aisha", "Segun", "Ngozi", "Yusuf", "Folake",
  "Ibrahim", "Blessing", "Chidi", "Halima", "Kunle", "Amara", "Musa", "Temi",
  "Obinna", "Zainab", "Bola", "Nneka", "Sadiq", "Funmi", "Uche", "Maryam",
] as const;

const LAST = [
  "Adeyemi", "Okafor", "Bello", "Nwosu", "Abubakar", "Eze", "Oyelaran", "Danjuma",
  "Ogunleye", "Chukwu", "Lawal", "Ibrahim", "Balogun", "Anyanwu", "Sani", "Okonkwo",
] as const;

const STATES = [
  "Lagos", "Kano", "Rivers", "Oyo", "Kaduna", "Enugu", "Anambra", "Delta",
  "Ogun", "Plateau", "Borno", "Edo",
] as const;

const BANKS = ["GTBank", "Access Bank", "Zenith Bank", "UBA", "First Bank", "Kuda"] as const;

const YEAR = 2026;

/** Deterministic 11-digit BVN derived from a NIN. Distinct from it, stable. */
function bvnFor(nin: string): string {
  let h = 2166136261;
  for (let i = 0; i < nin.length; i++) {
    h ^= nin.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // 22xxxxxxxxx keeps it visibly a different number space from the NIN.
  return "22" + String(h % 1_000_000_000).padStart(9, "0");
}

/** Deterministic hash used to derive card details from a NIN. */
function hash32(seed: string, salt: string): number {
  let h = 2166136261;
  const s = salt + seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Appends the Luhn check digit so the number validates like a real card. */
function luhnComplete(first15: string): string {
  let sum = 0;
  const rev = [...first15].reverse();
  for (let i = 0; i < rev.length; i++) {
    let d = Number(rev[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return first15 + String((10 - (sum % 10)) % 10);
}

/** 5061 is the Verve BIN range — the card most Nigerians actually carry. */
function cardFor(nin: string) {
  const body = String(hash32(nin, "pan") % 100_000_000_000).padStart(11, "0");
  const month = (hash32(nin, "exp") % 12) + 1;
  return {
    card_number: luhnComplete("5061" + body),
    card_expiry: `${String(month).padStart(2, "0")}/${28 + (hash32(nin, "yr") % 3)}`,
    card_cvv: String(hash32(nin, "cvv") % 1000).padStart(3, "0"),
  };
}

function ageBand(age: number) {
  if (age < 18) return "under_18";
  if (age <= 25) return "18-25";
  if (age <= 35) return "26-35";
  if (age <= 50) return "36-50";
  return "51+";
}

interface Person {
  nin: string;
  /** Bank Verification Number — the identifier that links a person to every
   *  bank they use. This, not an account number, is what a Nigerian bank
   *  identifies you by. */
  bvn: string;
  name: string;
  dob: string;
  age: number;
  state: string;
  account: string;
  bank: string;
  card_ref: string;
  /** Verve-style 16-digit PAN, Luhn-valid. Synthetic. */
  card_number: string;
  card_expiry: string;
  card_cvv: string;
  monthly_income: number;
  bvn_verified: boolean;
  account_status: "active" | "inactive";
  card_active: boolean;
  card_tier: "classic" | "gold" | "platinum";
}

const people: Person[] = [];
const seenNin = new Set<string>();
const seenAcct = new Set<string>();

// A deliberate spread of ages so the demo can show under-18 rejection, the
// 18-25 student band, and older holders who fail the student check honestly.
const AGE_PLAN = [
  ...Array(28).fill(0).map(() => int(15, 17)),
  ...Array(80).fill(0).map(() => int(18, 25)),
  ...Array(50).fill(0).map(() => int(26, 35)),
  ...Array(28).fill(0).map(() => int(36, 50)),
  ...Array(14).fill(0).map(() => int(51, 72)),
];

for (const age of AGE_PLAN) {
  let nin: string;
  do {
    nin = String(int(10000000000, 99999999999));
  } while (seenNin.has(nin));
  seenNin.add(nin);

  let account: string;
  do {
    account = String(int(1000000000, 9999999999));
  } while (seenAcct.has(account));
  seenAcct.add(account);

  const income = pick([45000, 72000, 95000, 120000, 180000, 240000, 310000, 480000, 620000, 850000]);
  const adult = age >= 18;

  // Minors get no bank or card product, which is realistic and gives the demo
  // an honest "you don't hold this credential" path.
  const accountStatus: "active" | "inactive" = adult && rand() > 0.08 ? "active" : "inactive";
  const cardActive = accountStatus === "active" && rand() > 0.12;

  people.push({
    nin,
    // Derived from the NIN rather than drawn from the PRNG, so adding this
    // field did not shift the sequence and reshuffle every existing record.
    bvn: bvnFor(nin),
    name: `${pick(FIRST)} ${pick(LAST)}`,
    dob: `${YEAR - age}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
    age,
    state: pick(STATES),
    account,
    bank: pick(BANKS),
    // The discarded draw keeps the PRNG sequence identical to before card
    // details were added, so no existing record's NIN shifts.
    card_ref: (int(1000, 9999), `•••• ${cardFor(nin).card_number.slice(-4)}`),
    ...cardFor(nin),
    monthly_income: income,
    bvn_verified: adult && rand() > 0.1,
    account_status: accountStatus,
    card_active: cardActive,
    card_tier: income >= 480000 ? "platinum" : income >= 180000 ? "gold" : "classic",
  });
}

const registry = {
  _note:
    "SYNTHETIC TEST DATA. Generated from a fixed seed. Not derived from, and not intended to match, any real person or record.",
  generated: "2026-09-21",
  count: people.length,
  people,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(registry, null, 2));

const bands = people.reduce<Record<string, number>>((a, p) => {
  const b = ageBand(p.age);
  a[b] = (a[b] ?? 0) + 1;
  return a;
}, {});

console.log(`Wrote ${people.length} synthetic records to packages/issuer-api/data/registry.json`);
console.log("  age bands:", bands);
console.log("\n  Sample NINs for the demo:");
for (const band of ["under_18", "18-25", "26-35"]) {
  const p = people.find((x) => ageBand(x.age) === band)!;
  console.log(`    CARD ${p.card_number}  exp ${p.card_expiry}  cvv ${p.card_cvv}`);
  console.log(`    ${band.padEnd(9)} NIN ${p.nin}  BVN ${p.bvn}  ${p.name}, ${p.age}`);
}
