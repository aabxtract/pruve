import { NextResponse } from "next/server";
import { pruve } from "@/lib/verifier";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await pruve.getRequest(params.id);
  if (!r) return NextResponse.json({ status: "expired" }, { status: 404 });

  return NextResponse.json({
    status: r.result ? "complete" : "pending",
    result: r.result ?? null,
    // The trace and raw proof feed the inspector panel on the result screen.
    trace: (r.result as { trace?: unknown } | undefined)?.trace ?? null,
    proof: r.proof ?? null,
  });
}
