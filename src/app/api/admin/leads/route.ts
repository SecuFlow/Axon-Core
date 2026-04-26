import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=0, stale-while-revalidate=30",
} as const;

type LeadRow = {
  id: string;
  created_at: string;
  company_name: string;
  domain?: string | null;
  contact_email?: string | null;
  market_segment?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  revenue_eur?: number | null;
  hq_location?: string | null;
  lead_segment?: string | null;
  stage?: string | null;
  next_action_at?: string | null;
  last_contacted_at?: string | null;
  notes?: string | null;
  manager_name?: string | null;
  linkedin_url?: string | null;
  corporate_group_name?: string | null;
  location_name?: string | null;
  phone?: string | null;
  department?: string | null;
  research_source?: string | null;
};

function looksLikeTestName(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return true;
  if (/(^|\b)(demo|test|testing|placeholder|sample|beispiel)(\b|$)/i.test(s)) {
    return true;
  }
  return false;
}

function isValidDomain(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return false;
  if (s.includes("://")) return false;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s);
}

function isValidLinkedIn(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return false;
  // Erlaubt auch ohne Protokoll: linkedin.com/in/... oder www.linkedin.com/in/...
  return /^(https?:\/\/)?(www\.)?linkedin\.com\/(in|pub|company)\/[^\s]+/i.test(s);
}

function normalizeLinkedIn(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

function slug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function computeDedupeKey(input: {
  lead_segment: "enterprise" | "smb";
  corporate_group_name: string;
  location_name: string;
  contact_email: string;
  domain: string | null;
}) {
  const seg = input.lead_segment;
  const group = slug(input.corporate_group_name);
  const loc = slug(input.location_name);
  const email = input.contact_email.trim().toLowerCase();
  if (group && loc && email) {
    return `${seg}:manual:${group}:${loc}:${email}`;
  }
  const d = (input.domain ?? "").trim().toLowerCase();
  if (d && loc) return `${seg}:domainloc:${d}:${loc}`;
  if (d) return `${seg}:domain:${d}`;
  return `${seg}:email:${email}`;
}

function mapLeadRow(r: LeadRow) {
  return {
    id: r.id,
    created_at: r.created_at,
    company_name: r.company_name,
    domain: typeof r.domain === "string" && r.domain.trim() ? r.domain.trim() : null,
    contact_email:
      typeof r.contact_email === "string" && r.contact_email.trim()
        ? r.contact_email.trim()
        : null,
    market_segment:
      typeof r.market_segment === "string" && r.market_segment.trim()
        ? r.market_segment.trim()
        : null,
    industry:
      typeof r.industry === "string" && r.industry.trim() ? r.industry.trim() : null,
    employee_count: typeof r.employee_count === "number" ? r.employee_count : null,
    revenue_eur: typeof r.revenue_eur === "number" ? r.revenue_eur : null,
    hq_location:
      typeof r.hq_location === "string" && r.hq_location.trim()
        ? r.hq_location.trim()
        : null,
    lead_segment: r.lead_segment === "smb" ? "smb" : "enterprise",
    stage: typeof r.stage === "string" && r.stage.trim() ? r.stage.trim() : "new",
    next_action_at:
      typeof r.next_action_at === "string" ? r.next_action_at : null,
    last_contacted_at:
      typeof r.last_contacted_at === "string" ? r.last_contacted_at : null,
    notes: typeof r.notes === "string" && r.notes.trim() ? r.notes : null,
    manager_name:
      typeof r.manager_name === "string" && r.manager_name.trim()
        ? r.manager_name.trim()
        : null,
    linkedin_url:
      typeof r.linkedin_url === "string" && r.linkedin_url.trim()
        ? r.linkedin_url.trim()
        : null,
    corporate_group_name:
      typeof r.corporate_group_name === "string" && r.corporate_group_name.trim()
        ? r.corporate_group_name.trim()
        : null,
    location_name:
      typeof r.location_name === "string" && r.location_name.trim()
        ? r.location_name.trim()
        : null,
    phone:
      typeof r.phone === "string" && r.phone.trim() ? r.phone.trim() : null,
    department:
      typeof r.department === "string" && r.department.trim()
        ? r.department.trim()
        : null,
    research_source:
      typeof r.research_source === "string" && r.research_source.trim()
        ? r.research_source.trim()
        : null,
  };
}

const SELECT_COLUMNS =
  "id, created_at, company_name, domain, contact_email, market_segment, industry, employee_count, revenue_eur, hq_location, lead_segment, stage, next_action_at, last_contacted_at, notes, manager_name, linkedin_url, corporate_group_name, location_name, phone, department, research_source";

const LEGACY_SELECT_COLUMNS =
  "id, created_at, company_name, domain, contact_email, market_segment, industry, employee_count, revenue_eur, hq_location, lead_segment, stage, next_action_at, last_contacted_at, notes";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: CACHE_HEADERS });
  }

  const segParam = request.nextUrl.searchParams.get("segment");
  const segmentFilter =
    segParam === "enterprise" || segParam === "smb" ? segParam : null;

  let q = ctx.service
    .from("leads")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);

  if (segmentFilter) {
    q = q.eq("lead_segment", segmentFilter);
  }

  let res = await q;

  // Fallback falls Migration noch nicht ausgerollt: legacy Spalten.
  if (
    res.error &&
    (res.error.message.toLowerCase().includes("column") ||
      res.error.message.toLowerCase().includes("does not exist"))
  ) {
    let lq = ctx.service
      .from("leads")
      .select(LEGACY_SELECT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (segmentFilter) lq = lq.eq("lead_segment", segmentFilter);
    const legacyRes = await lq;
    res = legacyRes as unknown as typeof res;
  }

  if (res.error) {
    if (res.error.message.includes("leads")) {
      return NextResponse.json({ leads: [] }, { headers: CACHE_HEADERS });
    }
    return NextResponse.json(
      { error: res.error.message },
      { status: 500, headers: CACHE_HEADERS },
    );
  }

  const leads = (res.data ?? []).map((row) => mapLeadRow(row as LeadRow));

  return NextResponse.json({ leads }, { headers: CACHE_HEADERS });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const corporate_group_name =
    typeof body.corporate_group_name === "string"
      ? body.corporate_group_name.trim()
      : "";
  const location_name =
    typeof body.location_name === "string" ? body.location_name.trim() : "";
  const manager_name =
    typeof body.manager_name === "string" ? body.manager_name.trim() : "";
  const linkedin_raw =
    typeof body.linkedin_url === "string" ? body.linkedin_url.trim() : "";
  const contact_email =
    typeof body.contact_email === "string" ? body.contact_email.trim() : "";

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const department =
    typeof body.department === "string" ? body.department.trim() : "";
  const research_source =
    typeof body.research_source === "string" ? body.research_source.trim() : "";

  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  const market_segment =
    typeof body.market_segment === "string" ? body.market_segment.trim() : "";
  const industry = typeof body.industry === "string" ? body.industry.trim() : "";
  const hq_location =
    typeof body.hq_location === "string" ? body.hq_location.trim() : "";
  const lead_segment: "enterprise" | "smb" =
    typeof body.lead_segment === "string" &&
    body.lead_segment.trim().toLowerCase() === "smb"
      ? "smb"
      : "enterprise";

  const employee_count =
    typeof body.employee_count === "number"
      ? body.employee_count
      : typeof body.employee_count === "string" && body.employee_count.trim()
        ? Number(body.employee_count)
        : NaN;
  const revenue_eur =
    typeof body.revenue_eur === "number"
      ? body.revenue_eur
      : typeof body.revenue_eur === "string" && body.revenue_eur.trim()
        ? Number(body.revenue_eur)
        : NaN;

  // --- Pflichtfelder (erweitert, manuelle Anlage) ---
  if (!corporate_group_name || looksLikeTestName(corporate_group_name)) {
    return NextResponse.json(
      { error: "Konzernname ist erforderlich." },
      { status: 400 },
    );
  }
  if (!location_name) {
    return NextResponse.json(
      { error: "Standortname ist erforderlich." },
      { status: 400 },
    );
  }
  if (!manager_name) {
    return NextResponse.json(
      { error: "Manager-Name ist erforderlich." },
      { status: 400 },
    );
  }
  if (!contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
    return NextResponse.json(
      { error: "Gültige Kontakt-E-Mail ist erforderlich." },
      { status: 400 },
    );
  }
  if (!linkedin_raw || !isValidLinkedIn(linkedin_raw)) {
    return NextResponse.json(
      { error: "Gültiger LinkedIn-URL ist erforderlich." },
      { status: 400 },
    );
  }

  // --- Optionale Felder validieren, wenn gesetzt ---
  if (domain && !isValidDomain(domain)) {
    return NextResponse.json({ error: "Ungültige Domain." }, { status: 400 });
  }

  const linkedin_url = normalizeLinkedIn(linkedin_raw);

  // company_name = abwärtskompatible Anzeige: "Konzern – Standort"
  const company_name = `${corporate_group_name} – ${location_name}`;

  const dedupe_key = computeDedupeKey({
    lead_segment,
    corporate_group_name,
    location_name,
    contact_email,
    domain: domain ? domain.toLowerCase() : null,
  });

  const insertPayload: Record<string, unknown> = {
    dedupe_key,
    company_name: company_name.slice(0, 512),
    domain: domain ? domain.toLowerCase().slice(0, 255) : null,
    contact_email: contact_email.slice(0, 320),
    market_segment: market_segment ? market_segment.slice(0, 64) : null,
    industry: industry ? industry.slice(0, 128) : null,
    employee_count: Number.isFinite(employee_count)
      ? Math.round(employee_count)
      : null,
    revenue_eur: Number.isFinite(revenue_eur) ? Math.round(revenue_eur) : null,
    hq_location: hq_location ? hq_location.slice(0, 1024) : null,
    lead_segment,
    stage: "new",
    // Tag 1 startet unmittelbar nach Anlage.
    next_action_at: new Date().toISOString(),
    manager_name: manager_name.slice(0, 256),
    linkedin_url: linkedin_url.slice(0, 512),
    corporate_group_name: corporate_group_name.slice(0, 256),
    location_name: location_name.slice(0, 256),
    phone: phone ? phone.slice(0, 64) : null,
    department: department ? department.slice(0, 128) : null,
    research_source: research_source ? research_source.slice(0, 512) : null,
  };

  const ins = await ctx.service
    .from("leads")
    .insert(insertPayload)
    .select("id")
    .single();

  if (ins.error) {
    const msg = ins.error.message;
    const lower = msg.toLowerCase();

    // Falls neue Spalten (Migration) noch nicht live: Retry ohne sie.
    if (lower.includes("column") && lower.includes("does not exist")) {
      const legacyPayload: Record<string, unknown> = { ...insertPayload };
      delete legacyPayload.manager_name;
      delete legacyPayload.linkedin_url;
      delete legacyPayload.corporate_group_name;
      delete legacyPayload.location_name;
      delete legacyPayload.phone;
      delete legacyPayload.department;
      delete legacyPayload.research_source;
      const retry = await ctx.service
        .from("leads")
        .insert(legacyPayload)
        .select("id")
        .single();
      if (retry.error) {
        return NextResponse.json(
          {
            error:
              "Leadmaschine-Migration ausstehend. Bitte 20260423222320_leadmaschine_manual_fields.sql ausführen.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ ok: true, id: retry.data?.id ?? null });
    }

    if (msg.includes("leads")) {
      return NextResponse.json(
        {
          error:
            "Leadmaschine ist noch nicht migriert (Tabelle fehlt). Bitte Supabase-Migration ausführen und erneut versuchen.",
        },
        { status: 503 },
      );
    }
    if (lower.includes("duplicate")) {
      return NextResponse.json(
        { error: "Dieser Lead existiert bereits (Deduplizierung aktiv)." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: ins.data?.id ?? null });
}
