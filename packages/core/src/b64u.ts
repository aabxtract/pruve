/**
 * base64url — the URL-safe alphabet, no padding.
 *
 * Plain base64 must never go into a query string: its alphabet contains "+",
 * which decodes to a space in a query value, and atob() strips ASCII
 * whitespace per spec. The byte silently disappears. For a ~600 char payload
 * the odds of containing no "+" are roughly 1 in 12,000.
 */
export function b64uFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function bytesFromB64u(s: string): Uint8Array {
  const b64 = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const b64uFromString = (s: string): string =>
  b64uFromBytes(new TextEncoder().encode(s));

export const stringFromB64u = (s: string): string =>
  new TextDecoder().decode(bytesFromB64u(s));
