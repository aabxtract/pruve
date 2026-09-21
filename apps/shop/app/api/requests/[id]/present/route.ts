import { NextResponse } from "next/server";
import { PruveError, type Proof } from "@pruve/sdk";
import { pruve } from "@/lib/verifier";

export const dynamic = "force-dynamic";

/**
 * The wallet posts here.
 *
 * Note what this handler does not do: it never calls Pruve, never calls the
 * issuer, and never forwards the proof anywhere. It verifies in-process and
 * answers.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const proof = body?.proof as Proof | undefined;
  if (!proof) {
    return NextResponse.json({ valid: false, reason: "No proof supplied" }, { status: 400 });
  }

  try {
    const result = await pruve.verifyPresentation(params.id, proof);
    // The trace is for our own result screen; the wallet only needs the verdict.
    return NextResponse.json({
      valid: result.valid,
      reason: result.reason,
      disclosed: result.disclosed,
      issuer: result.issuer,
      receipt_id: result.receipt_id,
      verified_at: result.verified_at,
    });
  } catch (err) {
    if (err instanceof PruveError) {
      const status = err.code === "unknown_request" ? 404 : err.code === "already_answered" ? 409 : 400;
      return NextResponse.json({ valid: false, reason: err.message, code: err.code }, { status });
    }
    console.error("[shop] verifyPresentation:", err);
    return NextResponse.json({ valid: false, reason: "Verification error" }, { status: 500 });
  }
}
