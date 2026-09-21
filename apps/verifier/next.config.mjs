/** @type {import('next').NextConfig} */
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
};
