import type { CredentialType, WalletCredential } from "@pruve/core";

const KEY = "pruve_wallet_v2";

export function getWallet(): WalletCredential[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function getCredential(type: CredentialType): WalletCredential | undefined {
  return getWallet().find((w) => w.credential.type === type);
}

export function saveCredential(entry: WalletCredential) {
  const wallet = getWallet().filter((w) => w.credential.type !== entry.credential.type);
  wallet.push(entry);
  localStorage.setItem(KEY, JSON.stringify(wallet));
}

export function clearWallet() {
  localStorage.removeItem(KEY);
}
