/**
 * fetch wrapper for every call the wallet makes.
 *
 * The only thing it adds is `ngrok-skip-browser-warning`. Without it, ngrok's
 * free-tier interstitial intercepts the request and returns an HTML warning
 * page where the wallet expects JSON — so credential issuance fails on the
 * phone with a parse error that looks nothing like its actual cause.
 *
 * The header is meaningless on any other host, so this is safe in production
 * and costs nothing. Requests are same-origin (both backends are proxied
 * through next.config.mjs rewrites), so no CORS preflight is triggered.
 */
export async function api(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: {
      "ngrok-skip-browser-warning": "true",
      ...(init.headers ?? {}),
    },
  });
}

export async function postJson(url: string, body: unknown): Promise<Response> {
  return api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
