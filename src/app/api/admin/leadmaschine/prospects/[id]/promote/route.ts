import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import {
  generateEmailPatterns,
  guessDomainFromCorporateName,
} from "@/lib/emailPatternGenerator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type Params = { params: Promise<{ id: string }> };

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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
  corporate_group_name: string;
  location_name: string;
  contact_email: string;
  domain: string | null;
}) {
  const group = slug(input.corporate_group_name);
  const loc = slug(input.location_name);
  const email = input.contact_email.trim().toLowerCase();
  if (group && loc && email) {
    return `enterprise:manual:${group}:${loc}:${email}`;
  }
  const d = (input.domain ?? "").trim().toLowerCase();
  if (d && loc) return `enterprise:domainloc:${d}:${loc}`;
  if (d) return `enterprise:domain:${d}`;
  return `enterprise:email:${email}`;
}

function sanitizeDomain(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!s) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

/**
 * Promote einen "connected" LinkedIn-Prospect in die Email-Leadmaschine.
 *
 * Body (optional):
 *   { contact_email?: string, domain?: string }
 * Wenn contact_email fehlt, wird das primaere Email-Pattern benutzt.
 * Wenn domain fehlt, wird sie aus dem Konzernnamen geraten.
 */
export async function POST(request: NextRequest, ctx2: Params) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }
  const { id } = await ctx2.params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { error: "Ungültige ID." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let body: { contact_email?: unknown; domain?: unknown } = {};
  try {
    if (request.headers.get("content-length") !== "0") {
      body = (await request.json()) as typeof body;
    }
  } catch {
    // Leerer Body ist ok.
  }

  const overrideEmail =
    typeof body.contact_email === "string" ? body.contact_email.trim() : "";
  const overrideDomain =
    typeof body.domain === "string" ? body.domain.trim() : "";

  const prospectRes = await ctx.service
    .from("linkedin_prospects")
    .select(
      "id, status, manager_name, linkedin_url, corporate_group_name, location_name, industry, city, department, domain, generated_email, generated_email_patterns, notes",
    )
    .eq("id", id)
    .maybeSingle();

  if (prospectRes.error) {
    return NextResponse.json(
      { error: prospectRes.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  const prospect = prospectRes.data as
    | {
        id: string;
        status: string;
        manager_name: string;
        linkedin_url: string;
        corporate_group_name: string | null;
        location_name: string | null;
        industry: string | null;
        city: string | null;
        department: string | null;
        domain: string | null;
        generated_email: string | null;
        generated_email_patterns: unknown;
        notes: string | null;
      }
    | null;

  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect nicht gefunden." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  if (prospect.status === "promoted") {
    return NextResponse.json(
      { error: "Dieser Prospect wurde bereits in die Email-Leadmaschine übernommen." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }
  if (prospect.status !== "connected") {
    return NextResponse.json(
      {
        error:
          "Prospect muss zuerst als 'vernetzt markiert' sein, bevor er in die Email-Leadmaschine übernommen werden kann.",
      },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const corporateGroup = prospect.corporate_group_name?.trim() ?? "";
  const locationName = prospect.location_name?.trim() ?? "";
  if (!corporateGroup || !locationName) {
    return NextResponse.json(
      {
        error:
          "Konzern- und Standortname müssen am Prospect gesetzt sein. Bitte zuerst bearbeiten.",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  // Domain-Ermittlung: override > prospect.domain > guess from corporate name.
  let domain =
    sanitizeDomain(overrideDomain) ??
    sanitizeDomain(prospect.domain) ??
    (guessDomainFromCorporateName(corporateGroup) ?? null);

  // Email-Pattern erzeugen und persistieren.
  const patterns = domain
    ? generateEmailPatterns({ managerName: prospect.manager_name, domain })
    : [];
  let contact_email = overrideEmail;
  if (!contact_email) {
    contact_email = prospect.generated_email?.trim() || patterns[0] || "";
  }
  if (!contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
    return NextResponse.json(
      {
        error:
          "Keine plausible Email gefunden. Bitte Domain oder Email manuell angeben.",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!domain) {
    // Falls manuelle Email angegeben wurde: domain aus email ableiten.
    const m = contact_email.match(/@([^@]+)$/);
    domain = m ? sanitizeDomain(m[1]) : null;
  }

  const company_name = `${corporateGroup} – ${locationName}`;
  const dedupe_key = computeDedupeKey({
    corporate_group_name: corporateGroup,
    location_name: locationName,
    contact_email,
    domain,
  });

  const linkedin_note_extra = [
    `LinkedIn: ${prospect.linkedin_url}`,
    patterns.length > 1 ? `Email-Pattern-Alternativen: ${patterns.slice(1).join(", ")}` : null,
    prospect.notes ? `Prospect-Notes: ${prospect.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const leadPayload: Record<string, unknown> = {
    dedupe_key,
    company_name: company_name.slice(0, 512),
    domain: domain ? domain.slice(0, 255) : null,
    contact_email: contact_email.slice(0, 320),
    industry: prospect.industry ? prospect.industry.slice(0, 128) : null,
    hq_location: prospect.city ? prospect.city.slice(0, 1024) : null,
    lead_segment: "enterprise",
    stage: "new",
    next_action_at: new Date().toISOString(),
    manager_name: prospect.manager_name.slice(0, 256),
    linkedin_url: prospect.linkedin_url.slice(0, 512),
    corporate_group_name: corporateGroup.slice(0, 256),
    location_name: locationName.slice(0, 256),
    department: prospect.department ? prospect.department.slice(0, 128) : null,
    research_source: "LinkedIn Matrix-Riss",
    notes: linkedin_note_extra.slice(0, 2048),
  };

  const insLead = await ctx.service
    .from("leads")
    .insert(leadPayload)
    .select("id")
    .single();

  if (insLead.error) {
    const msg = insLead.error.message;
    const lower = msg.toLowerCase();
    if (lower.includes("duplicate")) {
      return NextResponse.json(
        {
          error:
            "Dieser Lead existiert bereits in der Email-Leadmaschine (Deduplizierung aktiv).",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const now = new Date().toISOString();
  const updProspect = await ctx.service
    .from("linkedin_prospects")
    .update({
      status: "promoted",
      promoted_at: now,
      promoted_lead_id: insLead.data?.id ?? null,
      domain,
      generated_email: contact_email,
      generated_email_patterns: patterns,
      updated_at: now,
    })
    .eq("id", id);

  if (updProspect.error) {
    // Lead ist bereits angelegt - nur noch loggen, UI sieht den Lead trotzdem.
    return NextResponse.json(
      {
        ok: true,
        lead_id: insLead.data?.id ?? null,
        contact_email,
        domain,
        warning: `Lead angelegt, Prospect-Status konnte nicht aktualisiert werden: ${updProspect.error.message}`,
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      lead_id: insLead.data?.id ?? null,
      contact_email,
      domain,
      email_patterns: patterns,
    },
    { headers: NO_STORE_HEADERS },
  );
}
