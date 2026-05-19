import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClientFromEnvSync,
} from "@/lib/leadDemoLink.server";
import {
  generateAutomatedDemo,
  normalizeDomain,
} from "@/lib/generateAutomatedDemo.server";
import { detectPlatformAdminFromCookies } from "@/lib/platformAdminFromRequest.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

type DemoApp = "konzern" | "worker";

function parseAppParam(raw: string | null): DemoApp {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "worker" || v === "mitarbeiter" || v === "werker"
    ? "worker"
    : "konzern";
}

function appBasePath(app: DemoApp): string {
  return app === "worker" ? "/worker/dashboard" : "/dashboard/konzern";
}

function buildDashboardDemoUrl(
  req: NextRequest,
  slug: string,
  app: DemoApp,
): URL {
  const u = new URL(appBasePath(app), req.url);
  u.searchParams.set("demo", slug);
  return u;
}

/**
 * Hängt `?demo=<slug>` an eine vorhandene Demo-URL an, ersetzt aber den Pfad
 * passend zur App-Wahl (z.B. /dashboard/konzern -> /worker/dashboard).
 */
function rewriteDemoUrlForApp(demoUrl: string, app: DemoApp): string {
  try {
    const u = new URL(demoUrl);
    u.pathname = appBasePath(app);
    return u.toString();
  } catch {
    return demoUrl;
  }
}

function isExpiredByCreatedAt(createdAtRaw: unknown): boolean {
  if (typeof createdAtRaw !== "string" || !createdAtRaw.trim()) return false;
  const ts = Date.parse(createdAtRaw);
  if (!Number.isFinite(ts)) return false;
  return ts + DEMO_TTL_MS <= Date.now();
}

function buildExpiredCheckoutUrl(req: NextRequest, slug: string | null, app: DemoApp): URL {
  const u = new URL("/checkout", req.url);
  u.searchParams.set("reason", "demo_expired");
  if (slug && slug.trim()) u.searchParams.set("demo", slug.trim());
  u.searchParams.set("app", app);
  return u;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const t = cleanToken(token);
  if (!t) return NextResponse.redirect(new URL("/demo-anfordern", req.url));

  // Welche App soll der Lead sehen? `?app=worker` -> Mitarbeiter-App,
  // sonst Konzern-Dashboard (Default fuer Manager/Entscheider).
  const app = parseAppParam(req.nextUrl.searchParams.get("app"));

  let service;
  try {
    service = createServiceClientFromEnvSync();
  } catch {
    return NextResponse.redirect(new URL("/demo-anfordern", req.url));
  }

  const linkRes = await service
    .from("lead_demo_links")
    .select("lead_id, opened_at, created_at, view_count")
    .eq("token", t)
    .maybeSingle();

  const leadId =
    typeof linkRes.data?.lead_id === "string" ? linkRes.data.lead_id : null;

  if (!leadId) {
    return NextResponse.redirect(new URL("/demo-anfordern", req.url));
  }

  const isExpired = isExpiredByCreatedAt((linkRes.data as { created_at?: unknown } | null)?.created_at);

  // Admin-Bypass: Wenn der Aufruf von einem eingeloggten Plattform-Admin kommt
  // (oder explizit per `?admin_preview=1` deklariert wird), wird der Klick NICHT
  // als „verwendet" gezählt. So kann der Admin Demo-Links vor dem Versand
  // prüfen, ohne die Tracking-Spalte „Angesehen" im Demo-Tab zu verfälschen.
  const explicitAdminPreview =
    req.nextUrl.searchParams.get("admin_preview") === "1";
  const adminDetection = await detectPlatformAdminFromCookies();
  const isAdminClick = explicitAdminPreview || adminDetection.isAdmin;

  if (!isAdminClick) {
    // Erstmalig: opened_at setzen (best-effort).
    if (!linkRes.data?.opened_at) {
      await service
        .from("lead_demo_links")
        .update({ opened_at: new Date().toISOString() })
        .eq("token", t);
    }
    // Jeder Aufruf erhöht view_count + last_viewed_at, dokumentiert App-Variante.
    const prevCount =
      typeof (linkRes.data as { view_count?: unknown } | null)?.view_count === "number"
        ? ((linkRes.data as { view_count: number }).view_count as number)
        : 0;
    await service
      .from("lead_demo_links")
      .update({
        view_count: prevCount + 1,
        last_viewed_at: new Date().toISOString(),
        last_view_app: app,
      })
      .eq("token", t);
  }

  // Audit-Log: zeichnet jeden Aufruf auf (auch Admin), damit man bei Bedarf
  // im Audit-Log nachvollziehen kann, wer wann reingeschaut hat.
  await service.from("audit_logs").insert({
    action: isAdminClick
      ? "lead.demo_link_opened_by_admin"
      : "lead.demo_link_opened",
    metadata: {
      lead_id: leadId,
      token: t,
      app,
      ua: req.headers.get("user-agent") ?? null,
      ip:
        req.headers.get("x-forwarded-for") ??
        req.headers.get("x-real-ip") ??
        null,
      admin_preview: isAdminClick,
      admin_user_id: adminDetection.userId,
    },
  });

  // Pipeline: Nur „echte" Demo-Klicks (kein Admin-Preview) markieren den Lead
  // als „Demo angefordert" und stoppen die Sequenz.
  if (!isAdminClick) {
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
          app,
          ua: req.headers.get("user-agent") ?? null,
        },
      });
    } catch {
      // best-effort; Redirect bleibt funktional
    }
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
    if (isExpired) {
      return NextResponse.redirect(buildExpiredCheckoutUrl(req, domain, app));
    }
    // Schnellpfad: existiert die Demo-Firma bereits? -> Direkt-Redirect ohne Logo-Fetch.
    const existing = await service
      .from("companies")
      .select("id")
      .eq("name", `DEMO:${domain}`)
      .limit(1)
      .maybeSingle();

    if (existing.data?.id) {
      return NextResponse.redirect(buildDashboardDemoUrl(req, domain, app));
    }

    // Fallback: erstmaliger Klick für diese Domain -> Demo on-the-fly anlegen
    // (Logo via Clearbit/Google Favicons/favicon.ico, voller Seed via ensureDemoSeedRich
    // beim nächsten Resolve). Logo-Fetch dauert ca. 1-3s; das nehmen wir beim
    // ersten Klick in Kauf.
    try {
      const result = await generateAutomatedDemo(domain, {
        baseUrl: new URL(req.url).origin,
      });
      return NextResponse.redirect(new URL(rewriteDemoUrlForApp(result.demoUrl, app)));
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
    if (isExpired) {
      return NextResponse.redirect(buildExpiredCheckoutUrl(req, defaultSlug, app));
    }
    return NextResponse.redirect(buildDashboardDemoUrl(req, defaultSlug, app));
  }

  // 3) Letzter Fallback: bisheriges Verhalten - Anfrage-Formular mit Prefill.
  if (isExpired) {
    return NextResponse.redirect(buildExpiredCheckoutUrl(req, null, app));
  }
  const u = new URL("/demo-anfordern", req.url);
  if (company) u.searchParams.set("company", company);
  if (seg) u.searchParams.set("market_segment", seg);
  u.searchParams.set("src", "demo-link");
  return NextResponse.redirect(u);
}
