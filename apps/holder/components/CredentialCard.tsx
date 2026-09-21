"use client";
import type { CredentialType } from "@pruve/core";
import type { StoredCredential } from "@/lib/store";

/**
 * The credential as the holder sees it.
 *
 * Rendered from what the issuer returned — never uploaded, never scanned.
 * Everything visible here (name, state, bank) is display material the wallet
 * keeps locally; none of it is committed to, so none of it can travel in a
 * proof. That contrast is the point: a card this rich next to a disclosure
 * this small is the argument, made visible.
 */

const THEME: Record<
  CredentialType,
  { title: string; issuer: string; grad: string; ring: string; accent: string }
> = {
  nimc: {
    title: "National Identity",
    issuer: "NIMC",
    grad: "from-emerald-500/25 via-emerald-500/5 to-transparent",
    ring: "ring-emerald-500/20",
    accent: "text-emerald-300",
  },
  bank: {
    title: "Bank Account",
    issuer: "Bank",
    grad: "from-sky-500/25 via-sky-500/5 to-transparent",
    ring: "ring-sky-500/20",
    accent: "text-sky-300",
  },
  card: {
    title: "Debit Card",
    issuer: "Card issuer",
    grad: "from-violet-500/25 via-violet-500/5 to-transparent",
    ring: "ring-violet-500/20",
    accent: "text-violet-300",
  },
};

/** Deterministic avatar tint, so the same person keeps the same colour. */
function tint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

export function CredentialCard({ entry }: { entry: StoredCredential }) {
  const type = entry.credential.type;
  const t = THEME[type];
  const name = entry.subject?.name;
  const claims = entry.credential.claim_hashes.length;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 ring-1 ${t.ring} p-5`}
    >
      {/* issuer wash + a soft sheen across the top-right, like a laminate */}
      <div aria-hidden className={`absolute inset-0 bg-gradient-to-br ${t.grad} pointer-events-none`} />
      <div
        aria-hidden
        className="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/[0.04] blur-2xl pointer-events-none"
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{t.title}</p>
            <p className={`text-sm font-semibold mt-0.5 ${t.accent}`}>
              {entry.subject?.bank ?? t.issuer}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/10 text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Verified
          </span>
        </div>

        <div className="flex items-center gap-4 mb-6">
          {name ? (
            <div
              className="w-14 h-14 rounded-2xl grid place-items-center text-white font-semibold text-lg shrink-0"
              style={{ background: tint(name) }}
              aria-hidden
            >
              {initialsOf(name)}
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 grid place-items-center text-2xl shrink-0">
              🪪
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold truncate">{name ?? "Credential holder"}</p>
            <p className="text-zinc-500 text-xs truncate">
              {entry.subject?.state
                ? `${entry.subject.state} State`
                : entry.subject?.card_ref
                  ? `Card ${entry.subject.card_ref}`
                  : entry.credential.issuer}
            </p>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600 mb-1">
              Facts it can attest
            </p>
            <p className="text-sm text-zinc-300">
              {claims} sealed {claims === 1 ? "claim" : "claims"}
            </p>
          </div>
          <p className="text-[10px] text-zinc-600 text-right leading-relaxed">
            Expires
            <br />
            <span className="text-zinc-400">
              {new Date(entry.credential.expires_at * 1000).toLocaleDateString("en-GB", {
                month: "short",
                year: "numeric",
              })}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** The dashed placeholder shown before a credential of this type is linked. */
export function EmptyCredentialCard({ type }: { type: CredentialType }) {
  const t = THEME[type];
  return (
    <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/20 p-5 hover:border-zinc-700 transition">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{t.title}</p>
          <p className="text-sm font-medium text-zinc-400 mt-1">Not linked</p>
        </div>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400">
          Link →
        </span>
      </div>
    </div>
  );
}
