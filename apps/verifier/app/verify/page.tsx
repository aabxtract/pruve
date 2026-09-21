"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { stringFromB64u, verifyProof, type VerifyResult } from "@pruve/core";
import { getPublicKeys } from "@/lib/keys";
import { ResultCard } from "@/components/ResultCard";

const API = process.env.NEXT_PUBLIC_VERIFIER_API_URL!;
const VERIFIER_ID = process.env.NEXT_PUBLIC_VERIFIER_ID ?? "pruve_demo";

function VerifyContent() {
  const params = useSearchParams();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const ran = useRef(false); // StrictMode double-mounts effects in dev

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const encoded = params.get("proof");
      if (!encoded) {
        setResult({ valid: false, reason: "No proof in this link" });
        setLoading(false);
        return;
      }
      try {
        const proof = JSON.parse(stringFromB64u(encoded));

        // Local check — this is the path that works with the issuer switched off.
        const { keys } = await getPublicKeys();
        const local = verifyProof(proof, keys);

        // Authoritative check + receipt. Falls back to the local answer if unreachable.
        try {
          const res = await fetch(`${API}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proof, verifier_id: VERIFIER_ID }),
            signal: AbortSignal.timeout(5000),
          });
          setResult(await res.json());
        } catch {
          setResult({ ...local, logged: false });
        }
      } catch (err) {
        console.error("[verify] link flow:", err);
        setResult({ valid: false, reason: "Could not read this proof" });
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Pruve Verify</h1>
      <p className="text-zinc-400 text-sm mb-8">Shared proof</p>
      {loading && <p className="text-center py-12 text-zinc-400">Verifying…</p>}
      {result && (
        <ResultCard result={result} onReset={() => (window.location.href = "/")} />
      )}
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-zinc-950" />}>
      <VerifyContent />
    </Suspense>
  );
}
