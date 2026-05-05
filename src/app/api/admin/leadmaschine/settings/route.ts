import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { LEAD_DAILY_HARD_CAP } from "@/lib/leadmaschineTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

const APOLLO_COLUMNS = [
  "apollo_enabled",
  "apollo_leads_per_day_enterprise",
  "apollo_leads_per_day_smb",
  "apollo_person_titles_enterprise",
  "apollo_person_titles_smb",
  "apollo_person_locations",
  "apollo_person_seniorities",
  "apollo_org_employee_min",
  "apollo_org_employee_max",
  "apollo_org_employee_min_smb",
  "apollo_org_employee_max_smb",
  "apollo_industries",
  "apollo_industries_smb",
  "apollo_reveal_personal_emails",
  "apollo_qualification_enabled",
  "apollo_qualification_threshold",
  "apollo_min_revenue_eur_enterprise",
  "apollo_min_revenue_eur_smb",
  "apollo_blacklist_industries",
  "apollo_require_domain_mx",
  "apollo_require_email_verified",
] as const;

const SELECT_ALL =
  "id, enabled, leads_per_month, max_actions_per_run, leads_per_month_enterprise, leads_per_month_smb, max_actions_per_run_enterprise, max_actions_per_run_smb, leads_per_day_enterprise, leads_per_day_smb, min_seconds_between_gmail_sends, auto_send_enabled, " +
  APOLLO_COLUMNS.join(", ") +
  ", updated_at";

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

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string" && v.trim()) out.push(v.trim().slice(0, 128));
  }
  return out;
}

function defaultsResponse() {
  return {
    enabled: true,
    leads_per_month: 600,
    max_actions_per_run: 10,
    leads_per_month_enterprise: 600,
    leads_per_month_smb: 300,
    max_actions_per_run_enterprise: 10,
    max_actions_per_run_smb: 10,
    leads_per_day_enterprise: 20,
    leads_per_day_smb: 10,
    leads_per_day_hard_cap: LEAD_DAILY_HARD_CAP,
    min_seconds_between_gmail_sends: 120,
    auto_send_enabled: false,
    apollo_enabled: false,
    apollo_leads_per_day_enterprise: 20,
    apollo_leads_per_day_smb: 10,
    apollo_person_titles_enterprise: [
      "Werkleiter",
      "Standortleiter",
      "Plant Manager",
      "Betriebsleiter",
    ],
    apollo_person_titles_smb: ["Geschäftsführer", "Inhaber", "CEO", "Owner", "Founder"],
    apollo_person_locations: ["Germany", "Austria", "Switzerland"],
    apollo_person_seniorities: ["c_suite", "vp", "head", "director", "manager", "owner", "founder"],
    apollo_org_employee_min: 100,
    apollo_org_employee_max: 5000,
    apollo_org_employee_min_smb: 5,
    apollo_org_employee_max_smb: 99,
    apollo_industries: [] as string[],
    apollo_industries_smb: [] as string[],
    apollo_reveal_personal_emails: false,
    apollo_qualification_enabled: true,
    apollo_qualification_threshold: 7,
    apollo_min_revenue_eur_enterprise: 50_000_000,
    apollo_min_revenue_eur_smb: 5_000_000,
    apollo_blacklist_industries: [
      "staffing and recruiting",
      "marketing and advertising",
      "advertising services",
      "public relations and communications",
      "management consulting",
      "human resources services",
      "computer software",
      "information technology and services",
      "internet",
      "venture capital and private equity",
    ] as string[],
    apollo_require_domain_mx: true,
    apollo_require_email_verified: true,
  };
}

export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  let res = await ctx.service
    .from("leadmaschine_settings")
    .select(SELECT_ALL)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Migration noch nicht durch: legacy fallback ohne Apollo-Spalten.
  if (
    res.error &&
    (res.error.message.toLowerCase().includes("column") ||
      res.error.message.toLowerCase().includes("does not exist"))
  ) {
    res = await ctx.service
      .from("leadmaschine_settings")
      .select(
        "id, enabled, leads_per_month, max_actions_per_run, leads_per_month_enterprise, leads_per_month_smb, max_actions_per_run_enterprise, max_actions_per_run_smb, leads_per_day_enterprise, leads_per_day_smb, min_seconds_between_gmail_sends, auto_send_enabled, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (res.error) {
    if (isTableMissingError(res.error.message)) {
      return NextResponse.json(defaultsResponse(), { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json(
      { error: res.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const row = (res.data ?? {}) as Record<string, unknown>;
  const def = defaultsResponse();

  const num = (k: string, d: number): number =>
    typeof row[k] === "number" && Number.isFinite(row[k] as number) ? (row[k] as number) : d;
  const arr = (k: string, d: string[]): string[] => {
    const v = row[k];
    if (!Array.isArray(v)) return d;
    const out: string[] = [];
    for (const x of v) if (typeof x === "string" && x.trim()) out.push(x.trim());
    return out.length > 0 ? out : d;
  };
  const bool = (k: string, d: boolean): boolean =>
    typeof row[k] === "boolean" ? (row[k] as boolean) : d;

  return NextResponse.json(
    {
      enabled: row.enabled === false ? false : true,
      leads_per_month: num("leads_per_month", def.leads_per_month),
      max_actions_per_run: num("max_actions_per_run", def.max_actions_per_run),
      leads_per_month_enterprise: num("leads_per_month_enterprise", def.leads_per_month_enterprise),
      leads_per_month_smb: num("leads_per_month_smb", def.leads_per_month_smb),
      max_actions_per_run_enterprise: num(
        "max_actions_per_run_enterprise",
        def.max_actions_per_run_enterprise,
      ),
      max_actions_per_run_smb: num("max_actions_per_run_smb", def.max_actions_per_run_smb),
      leads_per_day_enterprise: clampInt(
        num("leads_per_day_enterprise", def.leads_per_day_enterprise),
        0,
        LEAD_DAILY_HARD_CAP,
      ),
      leads_per_day_smb: clampInt(
        num("leads_per_day_smb", def.leads_per_day_smb),
        0,
        LEAD_DAILY_HARD_CAP,
      ),
      leads_per_day_hard_cap: LEAD_DAILY_HARD_CAP,
      min_seconds_between_gmail_sends: num(
        "min_seconds_between_gmail_sends",
        def.min_seconds_between_gmail_sends,
      ),
      auto_send_enabled: bool("auto_send_enabled", def.auto_send_enabled),
      apollo_enabled: bool("apollo_enabled", def.apollo_enabled),
      apollo_leads_per_day_enterprise: num(
        "apollo_leads_per_day_enterprise",
        def.apollo_leads_per_day_enterprise,
      ),
      apollo_leads_per_day_smb: num("apollo_leads_per_day_smb", def.apollo_leads_per_day_smb),
      apollo_person_titles_enterprise: arr(
        "apollo_person_titles_enterprise",
        def.apollo_person_titles_enterprise,
      ),
      apollo_person_titles_smb: arr("apollo_person_titles_smb", def.apollo_person_titles_smb),
      apollo_person_locations: arr("apollo_person_locations", def.apollo_person_locations),
      apollo_person_seniorities: arr("apollo_person_seniorities", def.apollo_person_seniorities),
      apollo_org_employee_min: num("apollo_org_employee_min", def.apollo_org_employee_min),
      apollo_org_employee_max: num("apollo_org_employee_max", def.apollo_org_employee_max),
      apollo_org_employee_min_smb: num(
        "apollo_org_employee_min_smb",
        def.apollo_org_employee_min_smb,
      ),
      apollo_org_employee_max_smb: num(
        "apollo_org_employee_max_smb",
        def.apollo_org_employee_max_smb,
      ),
      apollo_industries: arr("apollo_industries", def.apollo_industries),
      apollo_industries_smb: arr("apollo_industries_smb", def.apollo_industries_smb),
      apollo_reveal_personal_emails: bool(
        "apollo_reveal_personal_emails",
        def.apollo_reveal_personal_emails,
      ),
      apollo_qualification_enabled: bool(
        "apollo_qualification_enabled",
        def.apollo_qualification_enabled,
      ),
      apollo_qualification_threshold: clampInt(
        num("apollo_qualification_threshold", def.apollo_qualification_threshold),
        1,
        10,
      ),
      apollo_min_revenue_eur_enterprise: num(
        "apollo_min_revenue_eur_enterprise",
        def.apollo_min_revenue_eur_enterprise,
      ),
      apollo_min_revenue_eur_smb: num(
        "apollo_min_revenue_eur_smb",
        def.apollo_min_revenue_eur_smb,
      ),
      apollo_blacklist_industries: arr(
        "apollo_blacklist_industries",
        def.apollo_blacklist_industries,
      ),
      apollo_require_domain_mx: bool(
        "apollo_require_domain_mx",
        def.apollo_require_domain_mx,
      ),
      apollo_require_email_verified: bool(
        "apollo_require_email_verified",
        def.apollo_require_email_verified,
      ),
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const setNum = (k: string, min: number, max: number) => {
    const v = body[k];
    if (typeof v === "number" || (typeof v === "string" && v.trim())) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) update[k] = clampInt(n, min, max);
    }
  };
  const setBool = (k: string) => {
    if (typeof body[k] === "boolean") update[k] = body[k];
  };
  const setArr = (k: string) => {
    const a = asStringArray(body[k]);
    if (a !== undefined) update[k] = a;
  };

  setBool("enabled");
  setBool("auto_send_enabled");
  setNum("leads_per_month", 1, 5000);
  setNum("max_actions_per_run", 1, 50);
  setNum("leads_per_month_enterprise", 1, 5000);
  setNum("leads_per_month_smb", 1, 5000);
  setNum("max_actions_per_run_enterprise", 1, 50);
  setNum("max_actions_per_run_smb", 1, 50);
  setNum("leads_per_day_enterprise", 0, LEAD_DAILY_HARD_CAP);
  setNum("leads_per_day_smb", 0, LEAD_DAILY_HARD_CAP);
  setNum("min_seconds_between_gmail_sends", 30, 3600);

  // Apollo-Spalten
  setBool("apollo_enabled");
  setNum("apollo_leads_per_day_enterprise", 0, LEAD_DAILY_HARD_CAP);
  setNum("apollo_leads_per_day_smb", 0, LEAD_DAILY_HARD_CAP);
  setArr("apollo_person_titles_enterprise");
  setArr("apollo_person_titles_smb");
  setArr("apollo_person_locations");
  setArr("apollo_person_seniorities");
  setNum("apollo_org_employee_min", 1, 1_000_000);
  setNum("apollo_org_employee_max", 1, 1_000_000);
  setNum("apollo_org_employee_min_smb", 1, 1_000_000);
  setNum("apollo_org_employee_max_smb", 1, 1_000_000);
  setArr("apollo_industries");
  setArr("apollo_industries_smb");
  setBool("apollo_reveal_personal_emails");

  // ICP-Qualifikation
  setBool("apollo_qualification_enabled");
  setNum("apollo_qualification_threshold", 1, 10);
  setNum("apollo_min_revenue_eur_enterprise", 0, 100_000_000_000);
  setNum("apollo_min_revenue_eur_smb", 0, 100_000_000_000);
  setArr("apollo_blacklist_industries");
  setBool("apollo_require_domain_mx");
  setBool("apollo_require_email_verified");

  if (Object.keys(update).length <= 1) {
    return NextResponse.json(
      { error: "Keine gültigen Felder." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

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
      // Falls Apollo-Spalten noch nicht migriert sind: Apollo-Felder droppen, retry.
      const m = upd.error.message.toLowerCase();
      if (m.includes("column") && APOLLO_COLUMNS.some((c) => m.includes(c))) {
        for (const c of APOLLO_COLUMNS) delete update[c];
        const retry = await ctx.service
          .from("leadmaschine_settings")
          .update(update)
          .eq("id", existing.data.id);
        if (retry.error) {
          return NextResponse.json(
            { error: retry.error.message },
            { status: 500, headers: NO_STORE_HEADERS },
          );
        }
        return NextResponse.json(
          {
            ok: true,
            warning:
              "Apollo-Spalten fehlen in der DB. Bitte Migration 20260505180000_leadmaschine_apollo_pivot.sql ausführen.",
          },
          { headers: NO_STORE_HEADERS },
        );
      }
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
        {
          status: isTableMissingError(ins.error.message) ? 503 : 500,
          headers: NO_STORE_HEADERS,
        },
      );
    }
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
