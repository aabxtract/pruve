"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCredential } from "@/lib/store";
import { postJson } from "@/lib/http";
import { Button, Field, Screen, TopBar } from "@/components/ui";

const ISSUER = process.env.NEXT_PUBLIC_ISSUER_URL!;

/**
 * Card linking.
 *
 * This screen collects the full card details on purpose. The bank validates
 * them, issues a credential attesting the card works, and then drops them —
 * nothing from the PAN, expiry or CVV is stored or turned into a claim, so
 * none of it can ever appear in a proof.
 *
 * Asking and discarding is a stronger demonstration than never asking: it
 * shows data minimisation happening rather than asserting it.
 */
export default function OnboardCard() {
  const [pan, setPan] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const digits = pan.replace(/\s/g, "");
  const valid = digits.length >= 13 && /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry) && cvv.length >= 3;

  function onPan(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 19);
    setPan(d.replace(/(.{4})/g, "$1 ").trim());
    if (error) setError("");
  }

  function onExpiry(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 4);
    setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
    if (error) setError("");
  }

  async function link() {
    setError("");
    setLoading(true);
    try {
      const res = await postJson(`${ISSUER}/issue/card`, {
        card_number: digits,
        expiry,
        cvv,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not link this card");
      saveCredential(body);
      // Clear the details from component state the moment we are done.
      setPan("");
      setCvv("");
      setExpiry("");
      router.replace("/wallet");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the card issuer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <TopBar back="/wallet" />

      <h1 className="text-2xl font-bold tracking-tight mb-3">Link your card</h1>
      <p className="text-zinc-400 text-sm leading-relaxed mb-7">
        Your bank checks the card and tells us one thing: that it works.
      </p>

      <Field
        label="Card number"
        inputMode="numeric"
        placeholder="0000 0000 0000 0000"
        value={pan}
        autoFocus
        onChange={(e) => onPan(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Expiry"
          inputMode="numeric"
          placeholder="MM/YY"
          value={expiry}
          maxLength={5}
          onChange={(e) => onExpiry(e.target.value)}
        />
        <Field
          label="CVV"
          inputMode="numeric"
          placeholder="123"
          value={cvv}
          maxLength={4}
          onChange={(e) => {
            setCvv(e.target.value.replace(/\D/g, "").slice(0, 4));
            if (error) setError("");
          }}
        />
      </div>

      <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 p-4 mb-6 -mt-1">
        <p className="text-[11px] uppercase tracking-widest text-amber-500/80 mb-2">
          Discarded after checking
        </p>
        <p className="text-sm text-zinc-400 leading-relaxed">
          The number, expiry and CVV are used once to verify the card, then thrown away. Only
          &ldquo;this card is active&rdquo; is kept — so none of it can ever be shared.
        </p>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <Button onClick={link} disabled={loading || !valid}>
        {loading ? "Checking with your bank…" : "Link card"}
      </Button>
    </Screen>
  );
}
