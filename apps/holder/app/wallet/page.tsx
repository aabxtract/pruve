"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TEMPLATE_LIST, type CredentialType } from "@pruve/core";
import { getWallet, type StoredCredential } from "@/lib/store";
import { CredentialCard, EmptyCredentialCard } from "@/components/CredentialCard";
import { getProfile, initials, type Profile } from "@/lib/profile";
import { Screen, SectionLabel } from "@/components/ui";

const CREDENTIALS: Array<{
  type: CredentialType;
  label: string;
  issuer: string;
  href: string;
  tint: string;
}> = [
  { type: "nimc", label: "NIMC Identity", issuer: "National Identity", href: "/onboard/nimc", tint: "from-emerald-500/20" },
  { type: "bank", label: "Bank Account", issuer: "Your bank", href: "/onboard/bank", tint: "from-sky-500/20" },
  { type: "card", label: "Debit Card", issuer: "Card issuer", href: "/onboard/card", tint: "from-violet-500/20" },
];

export default function Wallet() {
  const [wallet, setWallet] = useState<StoredCredential[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    setWallet(getWallet());
    setProfile(getProfile());
  }, []);

  const has = (t: CredentialType) => !!wallet?.some((w) => w.credential.type === t);
  const linked = wallet?.length ?? 0;
  const loading = wallet === null;

  return (
    <Screen>
      {/* ------------------------------------------------------------ header */}
      <header className="flex items-center justify-between pt-4 mb-8">
        <div>
          <p className="text-zinc-500 text-sm">
            {profile ? `Hello, ${profile.name.split(" ")[0]}` : "Your wallet"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Pruve</h1>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="w-10 h-10 rounded-full bg-zinc-800 grid place-items-center text-sm font-semibold text-zinc-300 hover:bg-zinc-700 transition"
        >
          {profile ? initials(profile.name) : "··"}
        </Link>
      </header>

      {/* ------------------------------------------------------- credentials */}
      <SectionLabel>Your credentials</SectionLabel>
      <div className="space-y-3 mb-3">
        {CREDENTIALS.map((c) => {
          const entry = wallet?.find((w) => w.credential.type === c.type);

          if (loading) {
            return (
              <div
                key={c.type}
                className="h-[168px] rounded-3xl border border-zinc-800 bg-zinc-900/50 animate-pulse"
              />
            );
          }

          return entry ? (
            <Link key={c.type} href="/settings" className="block active:scale-[0.995] transition">
              <CredentialCard entry={entry} />
            </Link>
          ) : (
            <Link key={c.type} href={c.href} className="block active:scale-[0.995] transition">
              <EmptyCredentialCard type={c.type} />
            </Link>
          );
        })}
      </div>

      {!loading && linked > 0 && (
        <p className="text-zinc-600 text-xs leading-relaxed mb-9">
          Everything on these cards stays here. None of it is part of a proof — not your name,
          not your bank, not the issuer&apos;s stamp.
        </p>
      )}
      {!loading && linked === 0 && <div className="mb-9" />}

      {/* ---------------------------------------------------------- proofs */}
      <SectionLabel>Prove something</SectionLabel>
      {!loading && linked === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center mb-8">
          <p className="text-3xl mb-3">🪪</p>
          <p className="font-medium text-sm mb-1">Nothing to prove yet</p>
          <p className="text-zinc-500 text-sm leading-relaxed mb-5">
            Link a credential above and your available proofs appear here.
          </p>
          <Link
            href="/onboard/nimc"
            className="inline-block bg-white text-zinc-950 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            Start with NIMC
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5 mb-8">
          {TEMPLATE_LIST.map((t) => {
            const available = has(t.credentialType);
            const body = (
              <>
                <span className="text-xl w-8 text-center shrink-0">{t.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{t.label}</p>
                  <p className="text-zinc-500 text-xs truncate">{t.description}</p>
                </div>
                {available && <span className="text-zinc-600 text-sm">→</span>}
              </>
            );
            const base = "flex items-center gap-3 p-3.5 rounded-2xl border transition";

            return available ? (
              <Link
                key={t.id}
                href={`/share?template=${t.id}`}
                className={`${base} border-zinc-800 bg-zinc-900 hover:border-zinc-600 active:scale-[0.99]`}
              >
                {body}
              </Link>
            ) : (
              <div
                key={t.id}
                aria-disabled
                title={`Needs your ${t.credentialType.toUpperCase()} credential`}
                className={`${base} border-zinc-900 bg-zinc-900/20 opacity-40`}
              >
                {body}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-zinc-600 text-xs text-center leading-relaxed pb-4">
        To answer a request, point your camera at the verifier&apos;s QR code.
      </p>
    </Screen>
  );
}
