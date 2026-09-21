/** @type {import('next').NextConfig} */

// Upstream origins, server-side only. These stay on localhost even when the
// wallet is reached through a tunnel, because the rewrite runs on the machine
// hosting Next, not in the phone's browser.
const ISSUER = process.env.ISSUER_ORIGIN ?? "http://localhost:3001";
const VERIFIER_API = process.env.VERIFIER_API_ORIGIN ?? "http://localhost:3003";
const DEV_API = process.env.DEVELOPER_API_ORIGIN ?? "http://localhost:3006";
const SHOP = process.env.SHOP_ORIGIN ?? "http://localhost:3005";

export default {
  transpilePackages: ["@pruve/core"],

  // @pruve/core uses NodeNext-style `.js` relative imports (./canonical.js
  // for ./canonical.ts). Map them back so webpack resolves the TS sources.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },

  /**
   * Proxies both backends through the wallet's own origin.
   *
   * This is what makes a phone demo need ONE tunnel instead of four: the
   * device only ever talks to the wallet, and Next forwards to the issuer and
   * the verifier API locally. It also removes CORS from the phone path
   * entirely, since every request is now same-origin.
   *
   * Set NEXT_PUBLIC_ISSUER_URL=/api/issuer and point the verifier's QR at
   * <tunnel>/api/verifier to use it.
   */
  async rewrites() {
    return [
      { source: "/api/issuer/:path*", destination: `${ISSUER}/:path*` },
      { source: "/api/verifier/:path*", destination: `${VERIFIER_API}/:path*` },
      // Campus Store, the third-party merchant. Proxied for the same reason:
      // the phone must reach it, and one tunnel is worth four.
      { source: "/api/shop/:path*", destination: `${SHOP}/api/:path*` },
      // Hosted Developer API, so a wallet can post proofs to it through the tunnel.
      { source: "/api/dev/:path*", destination: `${DEV_API}/v1/:path*` },
    ];
  },
};
