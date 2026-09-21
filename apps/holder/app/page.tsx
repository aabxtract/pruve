"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getProfile } from "@/lib/profile";
import { getWallet } from "@/lib/store";

/**
 * Landing page.
 *
 * Anyone who already has a profile is sent straight to the wallet — a
 * returning user should never have to read the pitch again. The redirect runs
 * after mount because the profile lives in localStorage, so the first paint is
 * deliberately blank rather than a flash of marketing.
 */
export default function Landing() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (getProfile()) {
      setLeaving(true);
      router.replace("/wallet");
    }
  }, [router]);

  // The markup is rendered server-side and shown immediately — over a tunnel a
  // blank first paint reads as a broken link. A returning user is redirected
  // on mount instead, and the page is dimmed while that happens so the
  // hand-off does not look like a flash of the wrong screen.
  return (
    <main
      className={`min-h-dvh bg-zinc-950 text-white transition-opacity duration-150 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* A soft glow behind the fold, so the page does not read as a flat form. */}
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full bg-emerald-500/15 blur-3xl"
        />
        <div className="relative px-6 pt-safe pb-10 max-w-md mx-auto">
          <div className="flex items-center gap-2 mb-16 pt-4">
            <div className="w-8 h-8 rounded-xl bg-white grid place-items-center text-zinc-950 font-bold text-sm">
              ✓
            </div>
            <span className="font-semibold tracking-tight">Pruve</span>
          </div>

          <h1 className="text-[2.6rem] leading-[1.05] font-bold tracking-tight mb-5">
            Prove one fact.
            <br />
            <span className="text-zinc-500">Reveal nothing else.</span>
          </h1>

          <p className="text-zinc-400 leading-relaxed mb-10">
            Show a bar you&apos;re over 18 without showing your NIN. Show a landlord you earn
            enough without showing your statements. Your details stay on your phone.
          </p>

          <Link
            href="/setup"
            className="block w-full bg-white text-zinc-950 rounded-2xl px-5 py-4 text-sm font-semibold text-center transition hover:bg-zinc-200 active:scale-[0.99]"
          >
            Set up your wallet
          </Link>
          <p className="text-center text-zinc-600 text-xs mt-4">
            Takes about a minute. No account, no password.
          </p>
        </div>
      </div>

      <div className="px-6 pb-safe max-w-md mx-auto">
        <div className="space-y-3 mb-12">
          {[
            {
              icon: "🔒",
              title: "Nothing leaves without you",
              body: "Every share shows exactly what will be sent, before it's sent.",
            },
            {
              icon: "🧮",
              title: "Not a screenshot, a signature",
              body: "Your credentials are cryptographically signed. Changing one value breaks them.",
            },
            {
              icon: "👁️",
              title: "Nobody watches",
              body: "The issuer that vouched for you is never told where you used it.",
            },
          ].map((f) => (
            <div key={f.title} className="flex gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
              <span className="text-xl leading-none mt-0.5">{f.icon}</span>
              <div>
                <p className="font-medium text-sm mb-1">{f.title}</p>
                <p className="text-zinc-500 text-sm leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>

        <ReturningHint />

        <p className="text-zinc-700 text-xs text-center leading-relaxed pb-6">
          Demo build. Identity data is synthetic and issuers are simulated.
        </p>
      </div>
    </main>
  );
}

/** Someone who cleared their profile but kept credentials shouldn't be stranded. */
function ReturningHint() {
  const [hasCreds, setHasCreds] = useState(false);
  useEffect(() => setHasCreds(getWallet().length > 0), []);
  if (!hasCreds) return null;
  return (
    <Link href="/wallet" className="block text-center text-sm text-zinc-400 underline mb-8">
      I already have credentials on this device
    </Link>
  );
}
