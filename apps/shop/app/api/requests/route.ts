import { NextResponse } from "next/server";
import { PruveError, type TemplateId } from "@pruve/sdk";
import { pruve } from "@/lib/verifier";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const request = await pruve.createRequest(body?.template as TemplateId, {
      cart: body?.cart ?? null,
    });
    return NextResponse.json({
      id: request.id,
      nonce: request.nonce,
      template: request.template,
      url: request.url,
      expires_at: request.expiresAt,
    });
  } catch (err) {
    if (err instanceof PruveError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[shop] createRequest:", err);
    return NextResponse.json({ error: "Could not create request" }, { status: 500 });
  }
}
