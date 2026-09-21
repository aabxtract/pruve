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
      <header className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-stone-900 grid place-items-center text-white text-sm font-bold">
            C
          </div>
          <div>
            <h1 className="font-bold tracking-tight leading-none">Campus Store</h1>
            <p className="text-[11px] text-stone-400 mt-0.5">a third-party merchant</p>
          </div>
        </div>
        {unlocked && (
          <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-green-100 text-green-800">
            Student pricing active
          </span>
        )}
      </header>

      {/* ---------------------------------------------------------- banner */}
      {stage === "browsing" && (
        <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-7 mb-10">
          <div
            aria-hidden
            className="absolute -top-24 -right-16 w-64 h-64 rounded-full bg-green-500/10 blur-3xl"
          />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.15em] text-stone-400 mb-2">
              Students save up to 30%
            </p>
            <h2 className="text-2xl font-bold tracking-tight mb-3">Unlock student pricing</h2>
            <p className="text-stone-600 leading-relaxed mb-6 max-w-lg">
              We need to know you&apos;re a Nigerian student under 26. We don&apos;t want your
              name, your NIN or your date of birth — and we&apos;ve built it so we
              <em> can&apos;t</em> receive them.
            </p>
            <button
              onClick={startVerification}
              className="bg-stone-900 text-white text-sm font-semibold rounded-xl px-6 py-3.5 hover:bg-stone-700 active:scale-[0.99] transition"
            >
              Verify with Pruve
            </button>
            <p className="text-xs text-stone-400 mt-3">
              Takes about ten seconds. No account, no sign-up.
            </p>
          </div>
        </div>
      )}

      {stage === "waiting" && (
        <div className="rounded-3xl border border-stone-200 bg-white p-8 mb-10 text-center">
          <h2 className="text-lg font-bold tracking-tight mb-1">Scan with your Pruve wallet</h2>
          <p className="text-sm text-stone-500 mb-6">Point your phone camera at this code.</p>
          <div className="inline-block bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <QRCode value={qrUrl} size={220} level="L" />
          </div>
          <div className="flex items-center justify-center gap-2 mt-6 text-sm text-stone-400">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Waiting for proof…
          </div>
          <button onClick={reset} className="mt-4 text-sm text-stone-500 hover:text-stone-800">
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
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-semibold tracking-tight">Popular this week</h2>
        {unlocked && (
          <span className="text-xs text-green-700 font-medium">Your discount is applied</span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {PRODUCTS.map((p) => {
          const save = Math.round(((p.full - p.student) / p.full) * 100);
          return (
            <div
              key={p.name}
              className={`group rounded-2xl border bg-white p-5 transition ${
                unlocked ? "border-green-200 shadow-sm" : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-3xl">{p.emoji}</span>
                <span
                  className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                    unlocked ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-500"
                  }`}
                >
                  −{save}%
                </span>
              </div>
              <p className="font-medium text-sm mb-2">{p.name}</p>
              {unlocked ? (
                <p className="flex items-baseline gap-2">
                  <span className="text-green-700 font-bold text-lg">{naira(p.student)}</span>
                  <span className="text-stone-400 line-through text-sm">{naira(p.full)}</span>
                </p>
              ) : (
                <>
                  <p className="font-bold text-lg">{naira(p.full)}</p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {naira(p.student)} for students
                  </p>
                </>
              )}
            </div>
          );
        })}
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
