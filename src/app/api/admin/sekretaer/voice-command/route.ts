import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseLeadrateCommand(text: string): { from: number | null; to: number } | null {
  const t = text.toLowerCase().trim();
  const match =
    t.match(/leadrate\s+von\s+(\d+)\s+auf\s+(\d+)/i) ??
    t.match(/leadrate\s+auf\s+(\d+)/i);
  if (!match) return null;
  if (match.length >= 3) {
    return { from: Number(match[1]), to: Number(match[2]) };
  }
  return { from: null, to: Number(match[1]) };
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  let body: { transcript?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const transcript =
    typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) {
    return NextResponse.json(
      { error: "Sprachtext fehlt." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const parsed = parseLeadrateCommand(transcript);
  if (!parsed) {
    return NextResponse.json(
      {
        ok: true,
        action: "unsupported",
        assistant_text:
          "Diesen Befehl habe ich noch nicht verstanden. Bitte sage zum Beispiel: Stelle die Leadrate von 50 auf 100.",
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  const nextRate = clampInt(parsed.to, 1, 500);
  const monthly = Math.min(2000, nextRate * 30);
  const update: Record<string, unknown> = {
    leads_per_day_enterprise: nextRate,
    leads_per_day_smb: nextRate,
    leads_per_month: monthly,
    leads_per_month_enterprise: monthly,
    leads_per_month_smb: monthly,
    updated_at: new Date().toISOString(),
  };

  const existing = await ctx.service
    .from("leadmaschine_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (existing.error && !existing.error.message.includes("leadmaschine_settings")) {
    return NextResponse.json(
      { error: existing.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  if (existing.data?.id) {
    const upd = await ctx.service
      .from("leadmaschine_settings")
      .update(update)
      .eq("id", existing.data.id);
    if (upd.error) {
      return NextResponse.json(
        { error: upd.error.message },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
  } else {
    const ins = await ctx.service.from("leadmaschine_settings").insert(update);
    if (ins.error) {
      return NextResponse.json(
        { error: ins.error.message },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      action: "update_leadrate",
      leads_per_day_enterprise: nextRate,
      assistant_text:
        "Alles klar, ich habe die Leadrate pro Tag angepasst. Kann ich sonst noch etwas tun?",
    },
    { headers: NO_STORE_HEADERS },
  );
}
