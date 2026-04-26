import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { LEAD_DAILY_HARD_CAP } from "@/lib/leadmaschineTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function isTableMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("42p01") ||
    (m.includes("relation") && m.includes("leadmaschine_settings"))
  );
}

export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  let res = await ctx.service
    .from("leadmaschine_settings")
    .select(
      "id, enabled, leads_per_month, max_actions_per_run, leads_per_month_enterprise, leads_per_month_smb, max_actions_per_run_enterprise, max_actions_per_run_smb, leads_per_day_enterprise, leads_per_day_smb, min_seconds_between_gmail_sends, auto_send_enabled, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    res.error &&
    (res.error.message.toLowerCase().includes("column") ||
      res.error.message.toLowerCase().includes("does not exist"))
  ) {
    res = await ctx.service
      .from("leadmaschine_settings")
      .select(
        "id, enabled, leads_per_month, max_actions_per_run, leads_per_month_enterprise, leads_per_month_smb, max_actions_per_run_enterprise, max_actions_per_run_smb, leads_per_day_enterprise, leads_per_day_smb, min_seconds_between_gmail_sends, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (
    res.error &&
    (res.error.message.toLowerCase().includes("column") ||
      res.error.message.toLowerCase().includes("does not exist"))
  ) {
    res = await ctx.service
      .from("leadmaschine_settings")
      .select(
        "id, enabled, leads_per_month, max_actions_per_run, leads_per_month_enterprise, leads_per_month_smb, max_actions_per_run_enterprise, max_actions_per_run_smb, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (res.error) {
    if (isTableMissingError(res.error.message)) {
      return NextResponse.json(
        {
          enabled: true,
          leads_per_month: 150,
          max_actions_per_run: 10,
          leads_per_month_enterprise: 150,
          leads_per_month_smb: 150,
          max_actions_per_run_enterprise: 10,
          max_actions_per_run_smb: 10,
          leads_per_day_enterprise: LEAD_DAILY_HARD_CAP,
          leads_per_day_smb: LEAD_DAILY_HARD_CAP,
          lead_daily_cap_locked: true,
          min_seconds_between_gmail_sends: 120,
          auto_send_enabled: false,
        },
        { headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: res.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const row = res.data as
    | {
        enabled?: unknown;
        leads_per_month?: unknown;
        max_actions_per_run?: unknown;
        leads_per_month_enterprise?: unknown;
        leads_per_month_smb?: unknown;
        max_actions_per_run_enterprise?: unknown;
        max_actions_per_run_smb?: unknown;
        leads_per_day_enterprise?: unknown;
        leads_per_day_smb?: unknown;
        min_seconds_between_gmail_sends?: unknown;
        auto_send_enabled?: unknown;
      }
    | null;

  return NextResponse.json(
    {
      enabled: row?.enabled === false ? false : true,
      leads_per_month:
        typeof row?.leads_per_month === "number" ? row.leads_per_month : 150,
      max_actions_per_run:
        typeof row?.max_actions_per_run === "number" ? row.max_actions_per_run : 10,
      leads_per_month_enterprise:
        typeof row?.leads_per_month_enterprise === "number"
          ? row.leads_per_month_enterprise
          : 150,
      leads_per_month_smb:
        typeof row?.leads_per_month_smb === "number" ? row.leads_per_month_smb : 150,
      max_actions_per_run_enterprise:
        typeof row?.max_actions_per_run_enterprise === "number"
          ? row.max_actions_per_run_enterprise
          : 10,
      max_actions_per_run_smb:
        typeof row?.max_actions_per_run_smb === "number" ? row.max_actions_per_run_smb : 10,
      // Tages-Cap ist im Code als Konstante hart fixiert (DSGVO/UWG).
      leads_per_day_enterprise: LEAD_DAILY_HARD_CAP,
      leads_per_day_smb: LEAD_DAILY_HARD_CAP,
      lead_daily_cap_locked: true,
      min_seconds_between_gmail_sends:
        typeof row?.min_seconds_between_gmail_sends === "number"
          ? row.min_seconds_between_gmail_sends
          : 120,
      auto_send_enabled: row?.auto_send_enabled === true,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  let body: {
    enabled?: unknown;
    leads_per_month?: unknown;
    max_actions_per_run?: unknown;
    leads_per_month_enterprise?: unknown;
    leads_per_month_smb?: unknown;
    max_actions_per_run_enterprise?: unknown;
    max_actions_per_run_smb?: unknown;
    leads_per_day_enterprise?: unknown;
    leads_per_day_smb?: unknown;
    min_seconds_between_gmail_sends?: unknown;
    auto_send_enabled?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;
  const autoSendEnabled =
    typeof body.auto_send_enabled === "boolean" ? body.auto_send_enabled : undefined;
  const leads =
    typeof body.leads_per_month === "number"
      ? body.leads_per_month
      : typeof body.leads_per_month === "string"
        ? Number(body.leads_per_month)
        : undefined;
  const maxPerRun =
    typeof body.max_actions_per_run === "number"
      ? body.max_actions_per_run
      : typeof body.max_actions_per_run === "string"
        ? Number(body.max_actions_per_run)
        : undefined;

  const leadsEnterprise =
    typeof body.leads_per_month_enterprise === "number"
      ? body.leads_per_month_enterprise
      : typeof body.leads_per_month_enterprise === "string"
        ? Number(body.leads_per_month_enterprise)
        : undefined;
  const leadsSmb =
    typeof body.leads_per_month_smb === "number"
      ? body.leads_per_month_smb
      : typeof body.leads_per_month_smb === "string"
        ? Number(body.leads_per_month_smb)
        : undefined;
  const maxPerRunEnterprise =
    typeof body.max_actions_per_run_enterprise === "number"
      ? body.max_actions_per_run_enterprise
      : typeof body.max_actions_per_run_enterprise === "string"
        ? Number(body.max_actions_per_run_enterprise)
        : undefined;
  const maxPerRunSmb =
    typeof body.max_actions_per_run_smb === "number"
      ? body.max_actions_per_run_smb
      : typeof body.max_actions_per_run_smb === "string"
        ? Number(body.max_actions_per_run_smb)
        : undefined;

  // HARD-CAP: leads_per_day_* werden vom Endpoint ignoriert.
  // Der Tages-Cap ist im Code als LEAD_DAILY_HARD_CAP = 5 fixiert (DSGVO/UWG).
  const leadsDayClientAttempt =
    body.leads_per_day_enterprise !== undefined ||
    body.leads_per_day_smb !== undefined;
  const minGmailGap =
    typeof body.min_seconds_between_gmail_sends === "number"
      ? body.min_seconds_between_gmail_sends
      : typeof body.min_seconds_between_gmail_sends === "string"
        ? Number(body.min_seconds_between_gmail_sends)
        : undefined;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (enabled !== undefined) update.enabled = enabled;
  if (leads !== undefined) update.leads_per_month = clampInt(leads, 1, 2000);
  if (maxPerRun !== undefined) update.max_actions_per_run = clampInt(maxPerRun, 1, 50);
  if (leadsEnterprise !== undefined)
    update.leads_per_month_enterprise = clampInt(leadsEnterprise, 1, 2000);
  if (leadsSmb !== undefined) update.leads_per_month_smb = clampInt(leadsSmb, 1, 2000);
  if (maxPerRunEnterprise !== undefined)
    update.max_actions_per_run_enterprise = clampInt(maxPerRunEnterprise, 1, 50);
  if (maxPerRunSmb !== undefined)
    update.max_actions_per_run_smb = clampInt(maxPerRunSmb, 1, 50);
  // leads_per_day_* NICHT uebernehmen (Hard-Cap im Code).
  // Optional: DB-Werte aktiv auf LEAD_DAILY_HARD_CAP zuruecksetzen, falls ein Schreibzugriff kam.
  if (leadsDayClientAttempt) {
    update.leads_per_day_enterprise = LEAD_DAILY_HARD_CAP;
    update.leads_per_day_smb = LEAD_DAILY_HARD_CAP;
    update.lead_daily_cap_locked = true;
  }
  if (minGmailGap !== undefined)
    update.min_seconds_between_gmail_sends = clampInt(minGmailGap, 30, 3600);
  if (autoSendEnabled !== undefined) update.auto_send_enabled = autoSendEnabled;

  if (Object.keys(update).length <= 1) {
    return NextResponse.json(
      { error: "Keine gültigen Felder." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  // Upsert via insert-on-empty (einfach, non-destruktiv).
  const existing = await ctx.service
    .from("leadmaschine_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing.error && !isTableMissingError(existing.error.message)) {
    return NextResponse.json(
      { error: existing.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  if (isTableMissingError(existing.error?.message ?? "")) {
    return NextResponse.json(
      {
        error:
          "Leadmaschine-Settings-Tabelle fehlt. Bitte Supabase-Migration ausführen (leadmaschine_settings).",
      },
      { status: 503, headers: NO_STORE_HEADERS },
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
        {
          error: isTableMissingError(ins.error.message)
            ? "Leadmaschine-Settings-Tabelle fehlt. Bitte Supabase-Migration ausführen."
            : ins.error.message,
        },
        { status: isTableMissingError(ins.error.message) ? 503 : 500, headers: NO_STORE_HEADERS },
      );
    }
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

