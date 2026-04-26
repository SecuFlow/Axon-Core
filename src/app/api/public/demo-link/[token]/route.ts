import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClientFromEnvSync,
} from "@/lib/leadDemoLink.server";
import {
  generateAutomatedDemo,
  normalizeDomain,
} from "@/lib/generateAutomatedDemo.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanToken(raw: string): string {
  return String(raw ?? "").trim();
}

function sanitizeEnv(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.replace(/\s/g, "").trim();
  return v.length > 0 ? v : null;
}

/**
 * Liefert eine pre-konfigurierte Default-Demo aus ENV (Fallback, falls Lead keine
 * verwertbare Domain hat oder die Auto-Generierung fehlschlägt). Erwartet entweder
 * eine Domain (z.B. "siemens.com") oder einen `demo_slug`.
 */
function getDefaultDemoSlugFromEnv(): string | null {
  return (
    sanitizeEnv(process.env.AXON_LEAD_DEMO_SLUG) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_DEFAULT_DEMO_SLUG) ??
    null
  );
}

function buildDashboardDemoUrl(req: NextRequest, slug: string): URL {
  const u = new URL("/dashboard/konzern", req.url);
  u.searchParams.set("demo", slug);
  return u;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const t = cleanToken(token);
  if (!t) return NextResponse.redirect(new URL("/demo-anfordern", req.url));

  let service;
  try {
    service = createServiceClientFromEnvSync();
  } catch {
    return NextResponse.redirect(new URL("/demo-anfordern", req.url));
  }

  const linkRes = await service
    .from("lead_demo_links")
    .select("lead_id, opened_at")
    .eq("token", t)
    .maybeSingle();

  const leadId =
    typeof linkRes.data?.lead_id === "string" ? linkRes.data.lead_id : null;

  if (!leadId) {
    return NextResponse.redirect(new URL("/demo-anfordern", req.url));
  }

  // Mark opened once (best-effort)
  if (!linkRes.data?.opened_at) {
    await service
      .from("lead_demo_links")
      .update({ opened_at: new Date().toISOString() })
      .eq("token", t);
  }

  // Track in audit logs (best-effort, ohne technische Details im UI)
  await service.from("audit_logs").insert({
    action: "lead.demo_link_opened",
    metadata: {
      lead_id: leadId,
      token: t,
      ua: req.headers.get("user-agent") ?? null,
      ip:
        req.headers.get("x-forwarded-for") ??
        req.headers.get("x-real-ip") ??
        null,
    },
  });

  // Pipeline: Klick auf Demo-Link/QR => sofort "DEMO angefordert" (Leadmaschine).
  try {
    await service
      .from("leads")
      .update({
        stage: "demo_sent",
        next_action_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    await service.from("lead_outreach_events").insert({
      lead_id: leadId,
      event_type: "demo_requested",
      channel: "web",
      status: "ok",
      metadata: {
        source: "demo_link",
        token: t,
        ua: req.headers.get("user-agent") ?? null,
      },
    });
  } catch {
    // best-effort; Redirect bleibt funktional
  }

  // Lead-Stammdaten für Demo-Auswahl + Formular-Prefill laden.
  const leadRes = await service
    .from("leads")
    .select("company_name, market_segment, domain")
    .eq("id", leadId)
    .maybeSingle();

  const company =
    typeof leadRes.data?.company_name === "string"
      ? leadRes.data.company_name
      : "";
  const seg =
    typeof leadRes.data?.market_segment === "string"
      ? leadRes.data.market_segment
      : "";
  const rawDomain =
    typeof leadRes.data?.domain === "string" ? leadRes.data.domain : "";

  // 1) Domain-spezifische Demo bevorzugt (Apple-Lead -> DEMO:apple.com mit Apple-Logo).
  const domain = normalizeDomain(rawDomain);
  if (domain) {
    // Schnellpfad: existiert die Demo-Firma bereits? -> Direkt-Redirect ohne Logo-Fetch.
    const existing = await service
      .from("companies")
      .select("id")
      .eq("name", `DEMO:${domain}`)
      .limit(1)
      .maybeSingle();

    if (existing.data?.id) {
      return NextResponse.redirect(buildDashboardDemoUrl(req, domain));
    }

    // Fallback: erstmaliger Klick für diese Domain -> Demo on-the-fly anlegen
    // (Logo via Clearbit/Google Favicons/favicon.ico, voller Seed via ensureDemoSeedRich
    // beim nächsten Resolve). Logo-Fetch dauert ca. 1-3s; das nehmen wir beim
    // ersten Klick in Kauf.
    try {
      const result = await generateAutomatedDemo(domain, {
        baseUrl: new URL(req.url).origin,
      });
      return NextResponse.redirect(new URL(result.demoUrl));
    } catch (err) {
      console.warn(
        "[demo-link] generateAutomatedDemo fehlgeschlagen, prüfe Default-Demo:",
        err,
      );
    }
  }

  // 2) Fallback: Default-Demo aus ENV (z.B. AXON_LEAD_DEMO_SLUG=siemens.com).
  const defaultSlug = getDefaultDemoSlugFromEnv();
  if (defaultSlug) {
    return NextResponse.redirect(buildDashboardDemoUrl(req, defaultSlug));
  }

  // 3) Letzter Fallback: bisheriges Verhalten - Anfrage-Formular mit Prefill.
  const u = new URL("/demo-anfordern", req.url);
  if (company) u.searchParams.set("company", company);
  if (seg) u.searchParams.set("market_segment", seg);
  u.searchParams.set("src", "demo-link");
  return NextResponse.redirect(u);
}
