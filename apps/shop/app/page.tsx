"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import type { Proof, VerifyResult } from "@pruve/core";
import { Inspector } from "@/components/Inspector";

const HOLDER = process.env.NEXT_PUBLIC_HOLDER_URL ?? "http://localhost:3000";
const SHOP_API_FOR_PHONE = process.env.NEXT_PUBLIC_SHOP_API_PUBLIC_URL || "";

const PRODUCTS = [
  { name: "Campus Hoodie", emoji: "🧥", full: 18500, student: 12900 },
  { name: "Lecture Notebook Set", emoji: "📓", full: 4200, student: 2500 },
  { name: "Wireless Earbuds", emoji: "🎧", full: 32000, student: 24500 },
  { name: "Backpack", emoji: "🎒", full: 27000, student: 19900 },
  { name: "Scientific Calculator", emoji: "🧮", full: 9800, student: 6900 },
  { name: "Desk Lamp", emoji: "💡", full: 11500, student: 8200 },
];

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

type Stage = "browsing" | "waiting" | "done";

export default function Shop() {
  const [stage, setStage] = useState<Stage>("browsing");
  const [req, setReq] = useState<{ id: string; nonce: string } | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [trace, setTrace] = useState<[] | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const unlocked = result?.valid === true;

  async function startVerification() {
    setResult(null);
    setProof(null);
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "ng_under_26" }),
    });
    const r = await res.json();
    setReq(r);
    setStage("waiting");

    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const poll = await fetch(`/api/requests/${r.id}`).then((x) => x.json()).catch(() => null);
      if (poll?.status === "complete") {
        clearInterval(timer.current!);
        setResult(poll.result);
        setProof(poll.proof);
        setTrace(poll.trace);
        setStage("done");
      }
    }, 1200);
  }

  function reset() {
    if (timer.current) clearInterval(timer.current);
    setStage("browsing");
    setReq(null);
    setResult(null);
    setProof(null);
  }

  // The wallet needs a URL it can reach from the phone. When the store is only
  // on localhost this falls back to the same origin, which works for a
  // single-machine demo.
  const apiForPhone = SHOP_API_FOR_PHONE || (typeof window !== "undefined" ? window.location.origin + "/api" : "");
  const qrUrl = req
    ? `${HOLDER}/share?template=ng_under_26&rid=${req.id}&nonce=${req.nonce}` +
      `&aud=${encodeURIComponent("campus_store")}&api=${encodeURIComponent(apiForPhone)}`
    : "";

  return (
    <main className="min-h-dvh max-w-3xl mx-auto px-6 py-10">
      <header className="flex items-baseline justify-between mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Campus Store</h1>
        <span className="text-xs text-stone-400">a third-party merchant</span>
      </header>
      <p className="text-stone-600 text-sm mb-8">
        Student pricing on everything. Verify once, no account needed.
      </p>

      {/* ---------------------------------------------------------- banner */}
      {stage === "browsing" && (
        <div className="rounded-2xl border border-stone-300 bg-white p-5 mb-8">
          <p className="font-medium mb-1">Unlock student pricing</p>
          <p className="text-sm text-stone-600 mb-4">
            We need to know you&apos;re a Nigerian student under 26. We don&apos;t want your name,
            your NIN or your date of birth — and we&apos;ve built it so we can&apos;t receive them.
          </p>
          <button
            onClick={startVerification}
            className="bg-stone-900 text-white text-sm font-semibold rounded-xl px-5 py-3 hover:bg-stone-700 transition"
          >
            Verify with Pruve
          </button>
        </div>
      )}

      {stage === "waiting" && (
        <div className="rounded-2xl border border-stone-300 bg-white p-6 mb-8 text-center">
          <p className="font-medium mb-1">Scan with your Pruve wallet</p>
          <p className="text-sm text-stone-600 mb-5">Point your phone camera at this code.</p>
          <div className="inline-block bg-white p-4 rounded-xl border border-stone-200">
            <QRCode value={qrUrl} size={220} level="L" />
          </div>
          <p className="text-sm text-stone-400 mt-5 animate-pulse">Waiting for proof…</p>
          <button onClick={reset} className="mt-4 text-sm text-stone-500 underline">
            Cancel
          </button>
        </div>
      )}

      {stage === "done" && result && (
        <div className="mb-8 space-y-4">
          <div
            className={`rounded-2xl border p-5 ${
              unlocked ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"
            }`}
          >
            <p className="text-xl font-bold mb-1">
              {unlocked ? "✅ Student pricing unlocked" : "❌ Not eligible"}
            </p>
            {unlocked ? (
              <p className="text-sm text-stone-600">
                We learned exactly {Object.keys(result.disclosed ?? {}).length} things about this
                customer, and nothing else.
              </p>
            ) : (
              <p className="text-sm text-red-700">{result.reason}</p>
            )}
            {result.receipt_id && (
              <p className="text-xs text-stone-400 mt-2 font-mono">receipt {result.receipt_id}</p>
            )}
            <button onClick={reset} className="mt-4 text-sm underline text-stone-600">
              Start over
            </button>
          </div>

          {proof && trace && <Inspector proof={proof} trace={trace} />}
        </div>
      )}

      {/* --------------------------------------------------------- catalog */}
      <div className="grid sm:grid-cols-2 gap-4">
        {PRODUCTS.map((p) => (
          <div key={p.name} className="rounded-2xl border border-stone-200 bg-white p-4 flex gap-4">
            <span className="text-3xl">{p.emoji}</span>
            <div className="flex-1">
              <p className="font-medium text-sm">{p.name}</p>
              {unlocked ? (
                <p className="mt-1">
                  <span className="text-green-700 font-bold">{naira(p.student)}</span>{" "}
                  <span className="text-stone-400 line-through text-sm">{naira(p.full)}</span>
                </p>
              ) : (
                <p className="mt-1">
                  <span className="font-bold">{naira(p.full)}</span>
                  <span className="block text-xs text-stone-400">
                    {naira(p.student)} with student pricing
                  </span>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-10 pt-6 border-t border-stone-200 text-xs text-stone-500 leading-relaxed">
        <p className="font-medium text-stone-700 mb-1">How this works</p>
        <p>
          Campus Store imports <code className="bg-stone-100 px-1 rounded">@pruve/core</code> and runs{" "}
          <code className="bg-stone-100 px-1 rounded">verifyProof()</code> on its own server against
          public keys it cached once. Pruve is never in the request path and never learns that this
          check happened. Demo data is synthetic.
        </p>
      </footer>
    </main>
  );
}
