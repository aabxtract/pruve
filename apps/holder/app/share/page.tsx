"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";
import { TEMPLATES, b64uFromString, type TemplateId } from "@pruve/core";
import { getCredential, type StoredCredential } from "@/lib/store";
import { buildProof, previewDisclosure } from "@/lib/proof";
import { postJson } from "@/lib/http";

function ShareContent() {
  const params = useSearchParams();
  const templateId = params.get("template") as TemplateId | null;
  const rid = params.get("rid");
  const nonce = params.get("nonce") ?? undefined;
  const audience = params.get("aud") ?? undefined;
  const api = params.get("api") ?? process.env.NEXT_PUBLIC_VERIFIER_API_URL;

  const template = templateId ? TEMPLATES[templateId] : undefined;

  // The wallet lives in localStorage, which does not exist during server
  // rendering. Reading it inside render made the server emit "you haven't
  // linked this" and the page could keep showing that even once the
  // credential was there. Read after mount instead, and hold a loading state
  // until we actually know.
  const [entry, setEntry] = useState<StoredCredential | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!template) return;
    setEntry(getCredential(template.credentialType));
    setReady(true);
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState<"confirm" | "qr" | "sent">("confirm");
  const [proofUrl, setProofUrl] = useState("");
  const [sent, setSent] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!template) return <Shell><p>Unknown template.</p></Shell>;

  if (!ready) {
    return (
      <Shell>
        <div className="pt-24 text-center text-zinc-500 text-sm">Opening your wallet…</div>
      </Shell>
    );
  }

  if (!entry) {
    return (
      <Shell>
        <p className="mb-4">You haven&apos;t linked a {template.credentialType.toUpperCase()} credential yet.</p>
        <a href={`/onboard/${template.credentialType}`} className="underline">Link it now →</a>
      </Shell>
    );
  }

  const preview = previewDisclosure(entry, template.id);

  async function handleConfirm() {
    setError("");
    setBusy(true);
    try {
      const proof = buildProof(entry!, template!.id, { nonce, audience });

      if (rid && api) {
        // Bound flow — send straight to the verifier that asked.
        const res = await postJson(`${api}/requests/${rid}/present`, { proof });
        setSent(await res.json());
        setStep("sent");
      } else {
        // Unbound link flow — base64url, never raw base64.
        // Built from the current origin so the link is correct wherever this
        // app is served from: localhost, a tunnel, or a deployed domain.
        const encoded = b64uFromString(JSON.stringify(proof));
        setProofUrl(`${window.location.origin}/verify?proof=${encoded}`);
        setStep("qr");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the proof");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      {step === "confirm" && (
        <>
          <div className="pt-4 mb-7">
            {audience ? (
              <>
                <p className="text-zinc-500 text-sm mb-1">
                  <span className="text-amber-400">{audience.replace(/_/g, " ")}</span> is asking
                </p>
                <h1 className="text-2xl font-bold tracking-tight">{template.label}</h1>
              </>
            ) : (
              <>
                <p className="text-zinc-500 text-sm mb-1">You&apos;re about to prove</p>
                <h1 className="text-2xl font-bold tracking-tight">{template.label}</h1>
              </>
            )}
            <p className="text-zinc-400 text-sm mt-2">{template.description}</p>
          </div>

          <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/25 p-4 mb-3">
            <p className="text-[11px] uppercase tracking-widest text-emerald-500/80 mb-3">
              Exactly this will be sent
            </p>
            <div className="space-y-2">
              {Object.entries(preview).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-emerald-300 flex items-center gap-2 min-w-0">
                    <span className="text-emerald-500">✓</span>
                    <span className="truncate">{k.replace(/_/g, " ")}</span>
                  </span>
                  <span className="font-mono text-emerald-200 shrink-0">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 mb-7">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3">
              Stays on this phone
            </p>
            <div className="grid grid-cols-2 gap-y-2">
              {template.hides.map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-zinc-500">
                  <span className="text-zinc-700">✗</span>
                  <span className="truncate">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="w-full bg-white text-zinc-950 font-semibold rounded-2xl px-5 py-4 text-sm transition hover:bg-zinc-200 active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? "Working…" : rid ? "Send proof" : "Generate proof"}
          </button>
          <a
            href="/wallet"
            className="block text-center text-sm text-zinc-500 mt-4 py-2"
          >
            Cancel
          </a>
        </>
      )}

      {step === "qr" && (
        <>
          <h1 className="text-xl font-bold mb-2">Show this QR</h1>
          <p className="text-zinc-400 text-sm mb-6">Expires in 5 minutes. Single use.</p>
          <div className="bg-white p-5 rounded-2xl mb-6 flex justify-center">
            <QRCode value={proofUrl} size={280} level="L" />
          </div>
          {/* Telegram's share endpoint takes the link and the message as
              separate params, unlike wa.me which takes one blob of text. */}
          <button
            onClick={() =>
              window.open(
                `https://t.me/share/url?url=${encodeURIComponent(
                  proofUrl
                )}&text=${encodeURIComponent(
                  "Verify my identity — this link expires in 5 minutes and works once."
                )}`,
                "_blank",
                "noopener,noreferrer"
              )
            }
            className="w-full bg-sky-500 text-white font-semibold rounded-xl p-4 mb-3"
          >
            Share via Telegram
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(proofUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="w-full bg-zinc-800 text-white font-semibold rounded-xl p-4"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
        </>
      )}

      {step === "sent" && (
        <div className="text-center py-12">
          <p className="text-5xl mb-4">{sent?.valid ? "✅" : "❌"}</p>
          <p className="text-xl font-bold mb-2">{sent?.valid ? "Proof accepted" : "Proof rejected"}</p>
          <p className="text-zinc-400 text-sm">{sent?.reason ?? "The verifier has their answer."}</p>
          <a href="/wallet" className="inline-block mt-8 text-sm underline text-zinc-400">
            Back to wallet
          </a>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto">{children}</main>;
}

export default function SharePage() {
  return (
    <Suspense fallback={<Shell><p className="text-zinc-500">Loading…</p></Shell>}>
      <ShareContent />
    </Suspense>
  );
}
