"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCredential } from "@/lib/store";
import { api, postJson } from "@/lib/http";
import { Button, Field, Screen, TopBar } from "@/components/ui";

const ISSUER = process.env.NEXT_PUBLIC_ISSUER_URL!;

interface Sample {
  nin: string;
  account: string;
  name: string;
  age: number;
}

/**
 * Shared onboarding form for all three issuers.
 *
 * The three screens differed only in a field label and an endpoint, so they
 * are one component. It also surfaces a real record from the issuer's
 * registry: a demo where nobody knows what to type is a demo that stalls.
 */
export function OnboardForm({
  kind,
  title,
  blurb,
  label,
  placeholder,
  digits,
  field,
  never,
  sampleKey,
}: {
  kind: "nimc" | "bank" | "card";
  title: string;
  blurb: string;
  label: string;
  placeholder: string;
  digits: number;
  field: "nin" | "account";
  never?: string[];
  sampleKey: "nin" | "account";
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sample, setSample] = useState<Sample | null>(null);
  const router = useRouter();

  useEffect(() => {
    api(`${ISSUER}/samples`)
      .then((r) => r.json())
      .then((s) => setSample(s.student))
      .catch(() => setSample(null));
  }, []);

  const valid = new RegExp(`^\\d{${digits}}$`).test(value);

  async function link() {
    setError("");
    if (!valid) return setError(`Enter all ${digits} digits`);
    setLoading(true);
    try {
      const res = await postJson(`${ISSUER}/issue/${kind}`, { [field]: value });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not link this credential");
      saveCredential(body);
      router.replace("/wallet");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the issuer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <TopBar back="/wallet" />

      <h1 className="text-2xl font-bold tracking-tight mb-3">{title}</h1>
      <p className="text-zinc-400 text-sm leading-relaxed mb-8">{blurb}</p>

      {never && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 mb-7">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2.5">
            Never collected
          </p>
          <div className="grid grid-cols-2 gap-y-1.5">
            {never.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-zinc-500">
                <span className="text-zinc-700">✗</span> {f}
              </div>
            ))}
          </div>
        </div>
      )}

      <Field
        label={label}
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        autoFocus
        maxLength={digits}
        onChange={(e) => {
          setValue(e.target.value.replace(/\D/g, ""));
          if (error) setError("");
        }}
        onKeyDown={(e) => e.key === "Enter" && valid && link()}
        error={error}
        hint={`${value.length}/${digits} digits`}
      />

      <Button onClick={link} disabled={loading || !valid}>
        {loading ? "Linking…" : "Link credential"}
      </Button>

      {sample && (
        <button
          onClick={() => setValue(sample[sampleKey])}
          className="w-full mt-5 rounded-2xl border border-dashed border-zinc-800 p-3.5 text-left hover:border-zinc-700 transition"
        >
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1">
            Demo record — tap to fill
          </p>
          <p className="text-sm font-mono text-zinc-300">{sample[sampleKey]}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {sample.name}, {sample.age} — synthetic test data
          </p>
        </button>
      )}
    </Screen>
  );
}
