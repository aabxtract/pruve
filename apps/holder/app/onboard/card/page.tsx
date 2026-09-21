"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCredential } from "@/lib/store";
import { postJson } from "@/lib/http";

const ISSUER = process.env.NEXT_PUBLIC_ISSUER_URL!;

/**
 * Card linking.
 *
 * There is no card-number field, and that is the point rather than an
 * omission. The bank already knows which card belongs to which account, so it
 * attests "this card works" against the account. No PAN, expiry or CVV is
 * collected, transmitted, or committed to — so none of it can ever be
 * disclosed in a proof.
 */
export default function OnboardCard() {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLink() {
    setError("");
    if (!/^\d{10}$/.test(account)) return setError("Enter the 10-digit account number");
    setLoading(true);
    try {
      const res = await postJson(`${ISSUER}/issue/card`, { account });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not link the card");
      saveCredential(await res.json());
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the card issuer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">Link your card</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Your bank confirms the card is active. We never ask for the card number.
      </p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Never collected</p>
        {["Card number", "Expiry date", "CVV", "Balance"].map((f) => (
          <div key={f} className="flex items-center gap-3 text-sm text-zinc-600">
            <span>✗</span> {f}
          </div>
        ))}
      </div>

      <input
        inputMode="numeric"
        placeholder="Account number (10 digits)"
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
        {loading ? "Linking…" : "Link card"}
      </button>
    </main>
  );
}
