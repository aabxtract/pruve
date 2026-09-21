/**
 * Deterministic JSON serialisation.
 *
 * Signatures are computed over this, never over JSON.stringify, because
 * stringify preserves *insertion* order. A payload that round-trips through
 * JSON.parse, localStorage, a QR code and a fetch body must serialise
 * byte-identically on the verifier's side or every signature fails.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") +
    "}"
  );
}
