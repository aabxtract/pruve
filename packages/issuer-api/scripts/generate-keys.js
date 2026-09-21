import { generateKeypair } from "@pruve/core";
import fs from "node:fs";
import path from "node:path";
const out = path.resolve(process.cwd(), ".keys.json");
if (fs.existsSync(out)) {
    console.error("Refusing to overwrite an existing .keys.json.");
    console.error("Delete it first if you really mean to rotate keys — every");
    console.error("credential ever issued under the old key stops verifying.");
    process.exit(1);
}
fs.writeFileSync(out, JSON.stringify({ nimc: generateKeypair(), bank: generateKeypair() }, null, 2));
console.log(`Keys written to ${out}`);
console.log("Confirm .keys.json is gitignored before you commit anything.");
