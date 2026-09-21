"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/profile";
import { Button, Field, Screen, TopBar } from "@/components/ui";

/**
 * Account setup.
 *
 * Two screens, no password, no server. The name is stored locally so the
 * wallet has something to greet; the second screen exists because a wallet
 * that never explains where its data lives is asking to be distrusted.
 */
export default function Setup() {
  const [step, setStep] = useState<"name" | "how">("name");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function next() {
    if (name.trim().length < 2) return setError("Enter a name so we know what to call you");
    setError("");
    setStep("how");
  }

  function finish() {
    saveProfile(name);
    router.replace("/wallet");
  }

  return (
    <Screen>
      <TopBar back={step === "how" ? undefined : "/"} />

      {step === "name" && (
        <>
          <div className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Step 1 of 2</div>
          <h1 className="text-2xl font-bold tracking-tight mb-3">What should we call you?</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-8">
            This is only for this phone. It never goes into a credential, and it is never part of
            anything you share.
          </p>

          <Field
            label="Your name"
            placeholder="e.g. Funmi"
            value={name}
            autoFocus
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && next()}
            error={error}
          />

          <Button onClick={next} disabled={name.trim().length < 2}>
            Continue
          </Button>
        </>
      )}

      {step === "how" && (
        <>
          <div className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Step 2 of 2</div>
          <h1 className="text-2xl font-bold tracking-tight mb-3">How this works</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-8">
            Three things worth knowing before you link anything.
          </p>

          <ol className="space-y-5 mb-10">
            {[
              {
                n: "1",
                t: "You link a credential once",
                b: "An issuer — NIMC, your bank, your card provider — vouches for a fact about you and signs it.",
              },
              {
                n: "2",
                t: "You choose what to reveal",
                b: "Every share shows the exact fields going out, and the ones staying behind, before you send.",
              },
              {
                n: "3",
                t: "It stays on this phone",
                b: "The secret parts of your credentials never leave the device. Clearing your browser data clears them for good.",
              },
            ].map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="shrink-0 w-7 h-7 rounded-full bg-zinc-800 text-zinc-300 grid place-items-center text-xs font-semibold">
                  {s.n}
                </span>
                <div>
                  <p className="font-medium text-sm mb-1">{s.t}</p>
                  <p className="text-zinc-500 text-sm leading-relaxed">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>

          <Button onClick={finish} variant="accent">
            Open my wallet
          </Button>
          <button
            onClick={() => setStep("name")}
            className="w-full text-center text-sm text-zinc-500 mt-4 py-2"
          >
            Back
          </button>
        </>
      )}
    </Screen>
  );
}
