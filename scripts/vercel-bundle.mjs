/**
 * Bundles a Hono service into a single Vercel function.
 *
 * Run from a package directory (`npm run build:vercel`). Expects `src/vercel.ts`
 * to default-export a Node request handler and writes a Build Output API v3
 * directory to `.vercel/output`, which Vercel uses in place of its own framework
 * build.
 *
 * Why bundle at all: the services import `@pruve/core`, a source-only workspace
 * package whose `exports` point at a `.ts` file. Vercel's per-file TypeScript
 * pipeline traces dependencies before it compiles them and ships `.js`, so the
 * package is either dropped from the function or left pointing at a file that
 * is not there. Inlining everything into one file sidesteps module resolution
 * at runtime entirely — and gives a smaller, faster-starting function.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
// Resolve esbuild from the package being built, not from this script's location.
const { build } = createRequire(path.join(root, "package.json"))("esbuild");

const entry = path.join(root, "src/vercel.ts");
if (!fs.existsSync(entry)) {
  console.error(`No ${path.relative(root, entry)} — nothing to bundle.`);
  process.exit(1);
}

const out = path.join(root, ".vercel/output");
const fn = path.join(out, "functions/index.func");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(fn, { recursive: true });

await build({
  entryPoints: [entry],
  outfile: path.join(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Some CommonJS dependencies call require() at load time; an ESM bundle has none.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});

fs.writeFileSync(
  path.join(fn, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs24.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      // The handler wants the raw Node request, untouched by Vercel's helpers.
      shouldAddHelpers: false,
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: "filesystem" },
        // Send everything to the one function, and hand it the ORIGINAL path so
        // Hono's own router does the routing.
        { src: "/(.*)", dest: "/", transforms: [{ type: "request.path", op: "set", args: "/$1" }] },
      ],
    },
    null,
    2
  )
);

const kb = (fs.statSync(path.join(fn, "index.mjs")).size / 1024).toFixed(0);
console.log(`Vercel output written to ${path.relative(root, out)} (function: ${kb} kB)`);
