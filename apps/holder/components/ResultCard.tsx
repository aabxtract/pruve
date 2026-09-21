"use client";
import type { VerifyResult } from "@pruve/core";

export function ResultCard({ result, onReset }: { result: VerifyResult; onReset: () => void }) {
  return (
    <div
      className={`rounded-2xl p-6 border ${
        result.valid ? "border-green-700 bg-green-950" : "border-red-700 bg-red-950"
      }`}
    >
      <p className="text-4xl mb-3">{result.valid ? "✅" : "❌"}</p>
      <p className="text-xl font-bold mb-4">{result.valid ? "VERIFIED" : "NOT VERIFIED"}</p>

      {result.valid && result.disclosed && (
        <div className="space-y-2 mb-6">
          {Object.entries(result.disclosed).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm border-b border-green-900 pb-2">
              <span className="text-zinc-400 capitalize">{k.replace(/_/g, " ")}</span>
              <span className="font-medium">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {!result.valid && <p className="text-red-300 text-sm mb-4">{result.reason}</p>}

      <div className="text-xs text-zinc-500 space-y-1">
        {result.issuer && <p>Issued by: {result.issuer}</p>}
        {result.verified_at && <p>Checked: {result.verified_at}</p>}
        {result.receipt_id && <p>Receipt: #{result.receipt_id}</p>}
        {result.logged === false && <p className="text-amber-500">Offline — verified locally, not logged</p>}
      </div>

      <button onClick={onReset} className="mt-6 w-full bg-zinc-800 text-white rounded-xl p-3 text-sm">
        Done
      </button>
    </div>
  );
}
