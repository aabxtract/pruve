"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TEMPLATE_LIST, type WalletCredential } from "@pruve/core";
import { getWallet } from "@/lib/store";

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletCredential[] | null>(null);

  useEffect(() => setWallet(getWallet()), []);

  const has = (t: string) => !!wallet?.some((w) => w.credential.type === t);

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Pruve</h1>
      <p className="text-zinc-400 text-sm mb-8">Your identity. Your control.</p>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Your credentials</h2>
        <div className="space-y-3">
          <CredCard label="NIMC Identity" linked={has("nimc")} href="/onboard/nimc" />
          <CredCard label="Bank Account" linked={has("bank")} href="/onboard/bank" />
          <CredCard label="Debit Card" linked={has("card")} href="/onboard/card" />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Prove something</h2>
        <div className="space-y-3">
          {TEMPLATE_LIST.map((t) => {
            const available = has(t.credentialType);
            const body = (
              <>
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <p className="font-medium text-sm">{t.label}</p>
                  <p className="text-zinc-500 text-xs">{t.description}</p>
                </div>
              </>
            );
            const base = "flex items-center gap-4 p-4 rounded-2xl border transition";

            return available ? (
              <Link
                key={t.id}
                href={`/share?template=${t.id}`}
                className={`${base} border-zinc-700 bg-zinc-900 hover:border-white`}
              >
                {body}
              </Link>
            ) : (
              <div
                key={t.id}
                aria-disabled
                className={`${base} border-zinc-800 bg-zinc-900/40 opacity-40`}
              >
                {body}
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-zinc-600 text-xs mt-10 leading-relaxed">
        To answer a verifier&apos;s request, point your phone camera at their QR code.
      </p>
    </main>
  );
}

function CredCard({ label, linked, href }: { label: string; linked: boolean; href: string }) {
  const inner = (
    <>
      <span className="text-sm font-medium">{label}</span>
      <span
        className={`text-xs px-2 py-1 rounded-full ${
          linked ? "bg-green-900 text-green-400" : "bg-zinc-800 text-zinc-400"
        }`}
      >
        {linked ? "✓ Linked" : "Link →"}
      </span>
    </>
  );
  const cls = "flex items-center justify-between p-4 rounded-2xl border border-zinc-800 bg-zinc-900";

  return linked ? (
    <div className={cls}>
      {inner}
      <Link href={href} className="sr-only">
        Re-link {label}
      </Link>
    </div>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}
