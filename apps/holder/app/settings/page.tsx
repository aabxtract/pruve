"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TEMPLATES } from "@pruve/core";
import { clearWallet, getWallet, type StoredCredential } from "@/lib/store";
import { clearProfile, getProfile, type Profile } from "@/lib/profile";
import { Button, Screen, SectionLabel, TopBar } from "@/components/ui";

const LABELS: Record<string, string> = {
  nimc: "NIMC Identity",
  bank: "Bank Account",
  card: "Debit Card",
};

export default function Settings() {
  const [wallet, setWallet] = useState<StoredCredential[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setWallet(getWallet());
    setProfile(getProfile());
  }, []);

  function wipe() {
    clearWallet();
    clearProfile();
    router.replace("/");
  }

  return (
    <Screen>
      <TopBar title="Settings" back="/wallet" />

      {profile && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 mb-8">
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Profile</p>
          <p className="font-medium">{profile.name}</p>
          <p className="text-zinc-500 text-xs mt-1">
            Stored on this device only. Never part of a credential.
          </p>
        </div>
      )}

      <SectionLabel>Linked credentials</SectionLabel>
      {wallet.length === 0 ? (
        <p className="text-zinc-500 text-sm mb-8">Nothing linked yet.</p>
      ) : (
        <div className="space-y-3 mb-8">
          {wallet.map((w) => {
            const templates = Object.values(TEMPLATES).filter(
              (t) => t.credentialType === w.credential.type
            );
            return (
              <div
                key={w.credential.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium text-sm">{LABELS[w.credential.type]}</p>
                    {w.subject?.name && (
                      <p className="text-zinc-500 text-xs mt-0.5">{w.subject.name}</p>
                    )}
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                    Linked
                  </span>
                </div>
                <dl className="text-xs space-y-1.5 text-zinc-500">
                  <div className="flex justify-between gap-3">
                    <dt>Issued by</dt>
                    <dd className="text-zinc-300 truncate">{w.credential.issuer}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Claims held</dt>
                    <dd className="text-zinc-300">{w.credential.claim_hashes.length}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Expires</dt>
                    <dd className="text-zinc-300">
                      {new Date(w.credential.expires_at * 1000).toLocaleDateString()}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Can prove</dt>
                    <dd className="text-zinc-300 text-right">
                      {templates.map((t) => t.label).join(", ") || "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}

      <SectionLabel>Add more</SectionLabel>
      <div className="space-y-2.5 mb-10">
        {(["nimc", "bank", "card"] as const)
          .filter((t) => !wallet.some((w) => w.credential.type === t))
          .map((t) => (
            <Link
              key={t}
              href={`/onboard/${t}`}
              className="flex items-center justify-between p-3.5 rounded-2xl border border-dashed border-zinc-800 hover:border-zinc-600 transition text-sm"
            >
              <span>{LABELS[t]}</span>
              <span className="text-zinc-500">Link →</span>
            </Link>
          ))}
        {wallet.length === 3 && (
          <p className="text-zinc-600 text-sm">Everything available is linked.</p>
        )}
      </div>

      <SectionLabel>Danger zone</SectionLabel>
      <div className="rounded-2xl border border-red-900/60 bg-red-950/20 p-4 mb-8">
        <p className="text-sm mb-1">Erase this wallet</p>
        <p className="text-zinc-500 text-xs leading-relaxed mb-4">
          Removes your profile and every credential from this device. The secret salts go with
          them, so this cannot be undone — you would re-link from each issuer.
        </p>
        {confirming ? (
          <div className="space-y-2">
            <Button onClick={wipe} variant="ghost" className="!border-red-800 !text-red-300">
              Yes, erase everything
            </Button>
            <button
              onClick={() => setConfirming(false)}
              className="w-full text-sm text-zinc-500 py-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <Button onClick={() => setConfirming(true)} variant="ghost">
            Erase wallet
          </Button>
        )}
      </div>
    </Screen>
  );
}
