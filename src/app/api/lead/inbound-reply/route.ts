import { NextResponse } from "next/server";
import { createServiceClientFromEnv } from "@/lib/leadmaschineRunner.server";
import { markLeadRepliedFromInbound } from "@/lib/leadReplyDetection.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

export async function POST(req: Request) {
  const secret = sanitizeEnv(process.env.AXON_INBOUND_SECRET);
  if (secret) {
    const got = (req.headers.get("x-axon-inbound-secret") ?? "").trim();
    if (!got || got !== secret) {
      return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
    }
  }

  let body: { subject?: unknown; text?: unknown; from?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject : "";
  const text = typeof body.text === "string" ? body.text : "";
  const from = typeof body.from === "string" ? body.from : "";

  const service = await createServiceClientFromEnv();
  const res = await markLeadRepliedFromInbound({
    service,
    subject,
    text,
    from,
    source: "inbound",
  });
  if (!res.ok) {
    const status =
      res.error.includes("Kein Reply-Token") ? 400 : res.error.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, lead_id: res.leadId });
}

