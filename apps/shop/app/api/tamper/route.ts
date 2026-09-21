import { NextResponse } from "next/server";
import { verifyProof, type Proof } from "@pruve/sdk";
import { pruve } from "@/lib/verifier";

export const dynamic = "force-dynamic";

/**
 * Powers the "try to forge it" control on the result screen.
 *
 * Applies the requested edit to a proof that already passed, then runs it
 * through the same verification the store uses for real. The rejection is
 * computed live in front of the audience rather than being a staged red
 * state. Uses verifyProof directly so a tamper attempt never burns the
 * single-use registry.
 */
export async function POST(req: Request) {
  const { proof, mutation } = (await req.json().catch(() => ({}))) as {
    proof?: Proof;
    mutation?: "flip_value" | "inject_claim" | "drop_disclosure" | "swap_issuer";
  };

  if (!proof || !mutation) {
    return NextResponse.json({ error: "proof and mutation required" }, { status: 400 });
  }

  const edited: Proof = JSON.parse(JSON.stringify(proof));
  let describe = "";

  switch (mutation) {
    case "flip_value": {
      const d = edited.disclosures[0];
      const was = d[2];
      d[2] = typeof was === "boolean" ? !was : `${String(was)}-EDITED`;
      describe = `Changed ${d[1]} from ${JSON.stringify(was)} to ${JSON.stringify(d[2])}`;
      break;
    }
    case "inject_claim": {
      edited.disclosures = [...edited.disclosures, ["forgedsalt00000000000", "is_staff", true]];
      describe = "Added a claim the issuer never signed (is_staff: true)";
      break;
    }
    case "drop_disclosure": {
      edited.disclosures = [];
      describe = "Removed every disclosure, keeping the valid signature";
      break;
    }
    case "swap_issuer": {
      edited.credential = { ...edited.credential, issuer: "totally-legit-issuer.example" };
      describe = "Rewrote the issuer name on the credential";
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown mutation" }, { status: 400 });
  }

  const keys = await pruve.publicKeys();
  const t0 = performance.now();
  const result = verifyProof(edited, keys, edited.nonce ? { nonce: edited.nonce } : undefined);
  const ms = +(performance.now() - t0).toFixed(2);

  return NextResponse.json({ mutation, describe, result, ms, disclosures: edited.disclosures });
}
