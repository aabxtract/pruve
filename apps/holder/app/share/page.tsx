"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";
import { TEMPLATES, b64uFromString, type TemplateId } from "@pruve/core";
import { getCredential } from "@/lib/store";
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
  const entry = useMemo(
    () => (template ? getCredential(template.credentialType) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template?.id]
  );

  const [step, setStep] = useState<"confirm" | "qr" | "sent">("confirm");
  const [proofUrl, setProofUrl] = useState("");
  const [sent, setSent] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!template) return <Shell><p>Unknown template.</p></Shell>;
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
          <h1 className="text-xl font-bold mb-2">{template.label}</h1>
          <p className="text-zinc-400 text-sm mb-2">{template.description}</p>
          {audience && (
            <p className="text-amber-400 text-xs mb-6">Requested by: {audience}</p>
          )}

          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3 mt-6">
            Exactly this will be sent
          </p>
          <div className="space-y-2 mb-6">
            {Object.entries(preview).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm text-green-400">
                <span>✓ {k.replace(/_/g, " ")}</span>
                <span className="font-mono">{String(v)}</span>
              </div>
            ))}
          </div>

          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Stays on this phone</p>
          <div className="space-y-2 mb-8">
            {template.hides.map((f) => (
              <div key={f} className="flex items-center gap-3 text-sm text-zinc-600">
                <span>✗</span> {f}
              </div>
            ))}
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="w-full bg-white text-black font-semibold rounded-xl p-4 disabled:opacity-50"
          >
            {busy ? "Working…" : rid ? "Send proof" : "Generate proof"}
          </button>
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
          <a href="/" className="inline-block mt-8 text-sm underline text-zinc-400">
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
