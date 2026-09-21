"use client";
import { useState } from "react";
import { hashDisclosure, type Disclosure, type Proof, type VerifyResult } from "@pruve/core";

interface TraceStep {
  label: string;
  ok: boolean;
  detail: string;
  ms: number;
}

type Mutation = "flip_value" | "inject_claim" | "drop_disclosure" | "swap_issuer";

interface TamperResult {
  describe: string;
  result: VerifyResult;
  ms: number;
}

const MUTATIONS: Array<{ id: Mutation; label: string }> = [
  { id: "flip_value", label: "Flip the answer" },
  { id: "inject_claim", label: "Add a fake claim" },
  { id: "drop_disclosure", label: "Disclose nothing" },
  { id: "swap_issuer", label: "Fake the issuer" },
];

/**
 * Shows what actually arrived and what was actually done with it.
 *
 * The credibility problem with any verification demo is that a green tick is
 * indistinguishable from `return true`. This panel answers that by showing the
 * real bytes, the real timings, and — via the tamper controls — real
 * rejections computed live rather than staged.
 */
export function Inspector({
  proof,
  trace,
  apiBase = "",
}: {
  proof: Proof;
  trace: TraceStep[];
  apiBase?: string;
}) {
  const [tab, setTab] = useState<"steps" | "payload" | "tamper">("steps");
  const [tamper, setTamper] = useState<TamperResult | null>(null);
  const [busy, setBusy] = useState<Mutation | null>(null);

  const disclosedHashes = new Set(proof.disclosures.map((d) => hashDisclosure(d as Disclosure)));
  const hidden = proof.credential.claim_hashes.filter((h) => !disclosedHashes.has(h));

  async function runTamper(mutation: Mutation) {
    setBusy(mutation);
    setTamper(null);
    try {
      const res = await fetch(`${apiBase}/api/tamper`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof, mutation }),
      });
      setTamper(await res.json());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-300 bg-white overflow-hidden">
      <div className="flex border-b border-stone-200 bg-stone-100 text-sm">
        {(
          [
            ["steps", "What we checked"],
            ["payload", "What we received"],
            ["tamper", "Try to forge it"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-3 font-medium transition ${
              tab === id
                ? "bg-white text-stone-900 border-b-2 border-stone-900"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "steps" && (
          <>
            <p className="text-sm text-stone-600 mb-4">
              Campus Store ran these itself. No call to Pruve, no call to the issuer.
            </p>
            <ol className="space-y-2">
              {trace.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-sm border-b border-stone-100 pb-2 last:border-0"
                >
                  <span className={s.ok ? "text-green-600" : "text-red-600"}>{s.ok ? "✓" : "✗"}</span>
                  <span className="flex-1">
                    <span className="font-medium">{s.label}</span>
                    <br />
                    <span className="text-stone-500 text-xs">{s.detail}</span>
                  </span>
                  <span className="font-mono text-xs text-stone-400 whitespace-nowrap">{s.ms}ms</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {tab === "payload" && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Stat n={proof.credential.claim_hashes.length} label="commitments signed" />
              <Stat n={proof.disclosures.length} label="values revealed" tone="green" />
            </div>

            <p className="text-xs uppercase tracking-widest text-stone-400 mb-2">Revealed</p>
            <div className="space-y-1 mb-4">
              {proof.disclosures.map((d, i) => (
                <div key={i} className="flex justify-between text-sm bg-green-50 rounded-lg px-3 py-2">
                  <span className="text-stone-700">{String(d[1]).replace(/_/g, " ")}</span>
                  <span className="font-mono font-medium">{JSON.stringify(d[2])}</span>
                </div>
              ))}
            </div>

            <p className="text-xs uppercase tracking-widest text-stone-400 mb-2">
              Withheld — {hidden.length} commitment{hidden.length === 1 ? "" : "s"} we cannot open
            </p>
            <div className="space-y-1">
              {hidden.map((h) => (
                <div key={h} className="text-sm bg-stone-100 rounded-lg px-3 py-2 font-mono text-stone-500">
                  {h}
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-3">
              Each is a hash of a 128-bit salt that never left the customer&apos;s phone. We cannot
              read them, and we cannot confirm a guess against them.
            </p>
          </>
        )}

        {tab === "tamper" && (
          <>
            <p className="text-sm text-stone-600 mb-4">
              Edit the proof that just passed, and watch the same verifier reject it.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {MUTATIONS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => runTamper(m.id)}
                  disabled={busy !== null}
                  className="text-sm border border-stone-300 rounded-xl px-3 py-2 hover:border-stone-900 disabled:opacity-40 transition"
                >
                  {busy === m.id ? "Checking…" : m.label}
                </button>
              ))}
            </div>

            {tamper && (
              <div
                className={`rounded-xl p-4 border ${
                  tamper.result.valid
                    ? "border-amber-400 bg-amber-50"
                    : "border-red-300 bg-red-50"
                }`}
              >
                <p className="text-xs text-stone-600 mb-2">{tamper.describe}</p>
                <p className={`font-bold ${tamper.result.valid ? "text-amber-700" : "text-red-700"}`}>
                  {tamper.result.valid ? "⚠ ACCEPTED" : "✗ REJECTED"}
                </p>
                {tamper.result.reason && (
                  <p className="text-sm text-red-700 mt-1">{tamper.result.reason}</p>
                )}
                <p className="text-xs text-stone-400 mt-2 font-mono">rejected in {tamper.ms}ms</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "green" }) {
  return (
    <div className={`rounded-xl p-3 ${tone === "green" ? "bg-green-50" : "bg-stone-100"}`}>
      <p className={`text-2xl font-bold ${tone === "green" ? "text-green-700" : "text-stone-900"}`}>
        {n}
      </p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  );
}
