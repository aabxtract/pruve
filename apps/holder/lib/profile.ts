/**
 * Local profile.
 *
 * Deliberately thin, and deliberately never sent anywhere. The display name
 * exists so the wallet can greet someone and so a credential card has a face
 * — it is not part of any credential, never committed to, and never
 * disclosed. Wiping site data wipes it, which is the correct behaviour for
 * something that only makes the app feel like theirs.
 */
const KEY = "pruve_profile_v3";

export interface Profile {
  name: string;
  createdAt: number;
}

export function getProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(name: string): Profile {
  const p: Profile = { name: name.trim(), createdAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(p));
  return p;
}

export function clearProfile() {
  localStorage.removeItem(KEY);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "P";
