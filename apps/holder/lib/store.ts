import type { CredentialType, WalletCredential } from "@pruve/core";

const KEY = "pruve_wallet_v5";

/**
 * What the issuer told us about the holder at issuance time.
 *
 * This is display material only. It is stored so the wallet can render a
 * credential that looks like the document it stands in for — and, crucially,
 * NONE of it is part of the credential. There is no commitment over any of
 * these fields, so nothing here can ever appear in a proof. Showing a rich
 * card next to a one-field disclosure is the clearest way to see that gap.
 */
export interface CredentialSubject {
  name?: string;
  state?: string;
  bank?: string;
  card_ref?: string;
  matched?: boolean;
}

export interface StoredCredential extends WalletCredential {
  subject?: CredentialSubject;
  linkedAt?: number;
}

export function getWallet(): StoredCredential[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function getCredential(type: CredentialType): StoredCredential | undefined {
  return getWallet().find((w) => w.credential.type === type);
}

export function saveCredential(entry: StoredCredential) {
  const wallet = getWallet().filter((w) => w.credential.type !== entry.credential.type);
  wallet.push({ ...entry, linkedAt: entry.linkedAt ?? Date.now() });
  localStorage.setItem(KEY, JSON.stringify(wallet));
}

export function clearWallet() {
  localStorage.removeItem(KEY);
}
