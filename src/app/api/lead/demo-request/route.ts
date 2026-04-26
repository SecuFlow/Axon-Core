import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { logEvent } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function isValidEmail(email: string): boolean {
  const s = email.trim();
  if (!s.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isLikelyThrowawayEmail(email: string): boolean {
  const s = email.trim().toLowerCase();
  if (!s.includes("@")) return true;
  const domain = s.split("@").pop() ?? "";
  if (!domain) return true;
  return [
    "mailinator.com",
    "10minutemail.com",
    "guerrillamail.com",
    "tempmail.com",
    "yopmail.com",
  ].some((d) => domain === d || domain.endsWith(`.${d}`));
}

function looksLikeTestName(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return true;
  if (/(^|\b)(demo|test|testing|placeholder|sample|beispiel)(\b|$)/i.test(s)) {
    return true;
  }
  return false;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const company = typeof body.company === "string" ? body.company.trim() : "";
  const marketSegment =
    typeof body.market_segment === "string" ? body.market_segment.trim() : "";
  const hq =
    typeof body.hq_location === "string" ? body.hq_location.trim() : "";
  const contactName =
    typeof body.contact_name === "string" ? body.contact_name.trim() : "";
  const contactRole =
    typeof body.contact_role === "string" ? body.contact_role.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  const employees =
    typeof body.employee_count === "number"
      ? body.employee_count
      : typeof body.employee_count === "string"
        ? Number(body.employee_count)
        : NaN;
  const revenue =
    typeof body.revenue_eur === "number"
      ? body.revenue_eur
      : typeof body.revenue_eur === "string"
        ? Number(body.revenue_eur)
        : NaN;

  if (!company || looksLikeTestName(company)) {
    return NextResponse.json(
      { error: "Ungültiger Konzernname." },
      { status: 400 },
    );
  }
  if (!marketSegment) {
    return NextResponse.json({ error: "Marktsegment fehlt." }, { status: 400 });
  }
  if (!Number.isFinite(employees) || employees <= 0) {
    return NextResponse.json(
      { error: "Mitarbeiterzahl fehlt/ungültig." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(revenue) || revenue <= 0) {
    return NextResponse.json(
      { error: "Umsatz fehlt/ungültig." },
      { status: 400 },
    );
  }
  if (!hq || hq.length < 6) {
    return NextResponse.json({ error: "HQ-Location fehlt." }, { status: 400 });
  }
  if (!contactName || contactName.length < 3 || looksLikeTestName(contactName)) {
    return NextResponse.json(
      { error: "Ansprechpartner fehlt/ungültig." },
      { status: 400 },
    );
  }
  if (!email || !isValidEmail(email) || isLikelyThrowawayEmail(email)) {
    return NextResponse.json(
      { error: "E-Mail ist ungültig oder nicht zulässig." },
      { status: 400 },
    );
  }

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server nicht konfiguriert." }, { status: 503 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ua = req.headers.get("user-agent") ?? null;
  const fwd = req.headers.get("x-forwarded-for") ?? null;

  const enterpriseOk = employees >= 250 && revenue >= 50_000_000;

  await logEvent(
    "lead.demo_request",
    enterpriseOk ? "Demo-Anfrage (Enterprise)" : "Demo-Anfrage",
    {
      company,
      market_segment: marketSegment,
      employee_count: employees,
      revenue_eur: revenue,
      hq_location: hq,
      contact_name: contactName,
      contact_role: contactRole || null,
      email,
      phone: phone || null,
      message: message || null,
      enterprise_ok: enterpriseOk,
      user_agent: ua,
      forwarded_for: fwd,
    },
    { service },
  );

  return NextResponse.json({ ok: true });
}

