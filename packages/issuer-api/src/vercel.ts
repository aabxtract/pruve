import { handle } from "@hono/node-server/vercel";
import app from "./index.js";

// Entry point for the Vercel bundle (scripts/vercel-bundle.mjs). Local dev and
// tests use index.ts directly and never load this file.
export default handle(app);
