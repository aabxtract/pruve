"use client";
import Link from "next/link";
import type { ReactNode } from "react";

/** Shared shell so every screen has the same gutters and safe-area handling. */
export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`min-h-dvh bg-zinc-950 text-white px-6 pt-safe pb-safe max-w-md mx-auto ${className}`}>
      {children}
    </main>
  );
}

export function TopBar({ title, back }: { title?: string; back?: string }) {
  return (
    <div className="flex items-center gap-3 -ml-2 mb-6">
      {back && (
        <Link
          href={back}
          aria-label="Back"
          className="w-9 h-9 grid place-items-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition"
        >
          ←
        </Link>
      )}
      {title && <h1 className="text-lg font-semibold">{title}</h1>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "accent";
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "bg-white text-zinc-950 hover:bg-zinc-200",
    accent: "bg-emerald-500 text-zinc-950 hover:bg-emerald-400",
    ghost: "bg-zinc-900 text-white border border-zinc-800 hover:border-zinc-600",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl px-5 py-4 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-40 disabled:active:scale-100 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block mb-5">
      <span className="block text-xs uppercase tracking-widest text-zinc-500 mb-2">{label}</span>
      <input
        {...input}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 text-white outline-none transition focus:border-zinc-500 placeholder:text-zinc-600"
      />
      {error ? (
        <span className="block text-red-400 text-xs mt-2">{error}</span>
      ) : hint ? (
        <span className="block text-zinc-500 text-xs mt-2">{hint}</span>
      ) : null}
    </label>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 mb-3">{children}</h2>
  );
}
