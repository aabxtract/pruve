"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { TEMPLATE_LIST, type TemplateId, type VerifyResult } from "@pruve/core";
import { ResultCard } from "@/components/ResultCard";

// What THIS browser calls. On a laptop running the stack, localhost is fine.
const API = process.env.NEXT_PUBLIC_VERIFIER_API_URL!;

// What the PHONE must call, embedded in the QR. These differ the moment the
// wallet is reached through a tunnel: the laptop can use localhost, the phone
// cannot. Falls back to API for the all-local case.
const API_FOR_PHONE = process.env.NEXT_PUBLIC_VERIFIER_API_PUBLIC_URL || API;

const HOLDER = process.env.NEXT_PUBLIC_HOLDER_URL!;
const VERIFIER_ID = process.env.NEXT_PUBLIC_VERIFIER_ID ?? "pruve_demo";

export default function VerifierHome() {
  const [req, setReq] = useState<{ id: string; nonce: string; template: TemplateId } | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function ask(template: TemplateId) {
    setResult(null);
    const res = await fetch(`${API}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, verifier_id: VERIFIER_ID }),
    });
    const r = await res.json();
    setReq(r);

    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const poll = await fetch(`${API}/requests/${r.id}`).then((x) => x.json()).catch(() => null);
      if (poll?.status === "complete") {
        clearInterval(timer.current!);
        setResult(poll.result);
      }
    }, 1200);
  }

  function reset() {
    if (timer.current) clearInterval(timer.current);
    setReq(null);
    setResult(null);
  }

  const qrUrl = req
    ? `${HOLDER}/share?template=${req.template}&rid=${req.id}&nonce=${req.nonce}` +
      `&aud=${encodeURIComponent(VERIFIER_ID)}&api=${encodeURIComponent(API_FOR_PHONE)}`
    : "";

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Pruve Verify</h1>
      <p className="text-zinc-400 text-sm mb-8">Ask for one fact. Get one answer.</p>

      {!req && (
        <div className="space-y-3">
          {TEMPLATE_LIST.map((t) => (
            <button
              key={t.id}
              onClick={() => ask(t.id)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-zinc-700 bg-zinc-900 hover:border-white text-left"
            >
              <span className="text-2xl">{t.icon}</span>
              <div>
                <p className="font-medium text-sm">{t.label}</p>
                <p className="text-zinc-500 text-xs">{t.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {req && !result && (
        <>
          <p className="text-zinc-400 text-sm mb-4">Point the customer&apos;s phone camera here.</p>
          <div className="bg-white p-5 rounded-2xl mb-6 flex justify-center">
            <QRCode value={qrUrl} size={280} level="L" />
          </div>
          <p className="text-center text-zinc-500 text-sm animate-pulse mb-6">Waiting for proof…</p>
          <button onClick={reset} className="w-full bg-zinc-800 rounded-xl p-3 text-sm">Cancel</button>
        </>
      )}

      {result && <ResultCard result={result} onReset={reset} />}
    </main>
  );
}
