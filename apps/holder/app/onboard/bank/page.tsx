"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCredential } from "@/lib/store";
import { postJson } from "@/lib/http";

const ISSUER = process.env.NEXT_PUBLIC_ISSUER_URL!;

export default function OnboardBank() {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLink() {
    setError("");
    if (!/^\d{10}$/.test(account)) return setError("Enter a valid 10-digit account number");
    setLoading(true);
    try {
      const res = await postJson(`${ISSUER}/issue/bank`, { account });
      if (!res.ok) throw new Error((await res.json()).error ?? "Issuance failed");
      saveCredential(await res.json());
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the issuer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">Link Bank</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Your account number fetches your credential and is never stored.
      </p>
      <input
        inputMode="numeric"
        placeholder="Enter account number (10 digits)"
        value={account}
        onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))}
        maxLength={10}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-white mb-4 outline-none focus:border-white"
      />
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <button
        onClick={handleLink}
        disabled={loading}
        className="w-full bg-white text-black font-semibold rounded-xl p-4 disabled:opacity-50"
      >
        {loading ? "Linking…" : "Link credential"}
      </button>
      <p className="text-zinc-600 text-xs mt-6">
        Demo issuer: ends in 0 → inactive; 1 → unverified; 2 → under ₦100k; 3+ → all pass.
      </p>
    </main>
  );
}
