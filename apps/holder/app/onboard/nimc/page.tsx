"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCredential } from "@/lib/store";
import { postJson } from "@/lib/http";

const ISSUER = process.env.NEXT_PUBLIC_ISSUER_URL!;

export default function OnboardNimc() {
  const [nin, setNin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLink() {
    setError("");
    if (!/^\d{11}$/.test(nin)) return setError("Enter a valid 11-digit NIN");
    setLoading(true);
    try {
      const res = await postJson(`${ISSUER}/issue/nimc`, { nin });
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
      <h1 className="text-xl font-bold mb-2">Link NIMC</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Your NIN fetches your credential and is never stored — not by us, not on this phone.
      </p>
      <input
        inputMode="numeric"
        placeholder="Enter NIN (11 digits)"
        value={nin}
        onChange={(e) => setNin(e.target.value.replace(/\D/g, ""))}
        maxLength={11}
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
        Demo issuer: the last digit decides the claims. Ends in 0 or 1 → under 18.
      </p>
    </main>
  );
}
