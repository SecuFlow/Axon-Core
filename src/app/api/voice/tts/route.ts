import { NextResponse } from "next/server";
import { elevenLabsTtsStream } from "@/lib/elevenlabs.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampText(input: unknown): string {
  const t = typeof input === "string" ? input.trim() : "";
  if (!t) return "";
  return t.slice(0, 900);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const text = clampText(b.text);
  if (!text) {
    return NextResponse.json({ error: "Text ist erforderlich." }, { status: 400 });
  }

  return await elevenLabsTtsStream({ text });
}

