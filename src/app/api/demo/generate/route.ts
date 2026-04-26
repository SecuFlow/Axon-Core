import { NextResponse } from "next/server";
import { generateAutomatedDemo } from "@/lib/generateAutomatedDemo.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestBaseUrl(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function POST(req: Request) {
  let body: { domain?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const domain = typeof body.domain === "string" ? body.domain : "";
  try {
    const r = await generateAutomatedDemo(domain, { baseUrl: requestBaseUrl(req) });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unbekannter Fehler." },
      { status: 400 },
    );
  }
}

