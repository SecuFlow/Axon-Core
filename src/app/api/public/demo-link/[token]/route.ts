import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClientFromEnvSync,
} from "@/lib/leadDemoLink.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanToken(raw: string): string {
  return String(raw ?? "").trim();
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

  if (leadId) {
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
    // Im UI entspricht das `stage = demo_sent`.
    try {
      const upd = await service
        .from("leads")
        .update({
          stage: "demo_sent",
          next_action_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);
      void upd;

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

    const leadRes = await service
      .from("leads")
      .select("company_name, market_segment")
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

    const u = new URL("/demo-anfordern", req.url);
    if (company) u.searchParams.set("company", company);
    if (seg) u.searchParams.set("market_segment", seg);
    u.searchParams.set("src", "demo-link");
    return NextResponse.redirect(u);
  }

  return NextResponse.redirect(new URL("/demo-anfordern", req.url));
}

