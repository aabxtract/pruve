/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ["@pruve/core", "@pruve/sdk"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};
