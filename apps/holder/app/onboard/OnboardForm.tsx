"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCredential } from "@/lib/store";
import { postJson } from "@/lib/http";
import { Button, Field, Screen, TopBar } from "@/components/ui";

const ISSUER = process.env.NEXT_PUBLIC_ISSUER_URL!;

/**
 * Shared onboarding form for all three issuers.
 *
 * The three screens differed only in a field label and an endpoint, so they
 * are one component.
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
}: {
  kind: "nimc" | "bank" | "card";
  title: string;
  blurb: string;
  label: string;
  placeholder: string;
  digits: number;
  field: "nin" | "bvn";
  never?: string[];
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

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
    </Screen>
  );
}
