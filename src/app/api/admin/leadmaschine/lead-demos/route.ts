import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { getPublicSiteUrlFromEnv } from "@/lib/leadDemoLink.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DemoRow = {
  id: string;
  lead_id: string;
  token: string;
  created_at: string | null;
  opened_at: string | null;
  view_count: number | null;
  last_viewed_at: string | null;
  last_view_app: string | null;
  metadata: unknown;
};

type LeadRow = {
  id: string;
  company_name: string | null;
  contact_email: string | null;
  manager_name: string | null;
  lead_segment: string | null;
  stage: string | null;
  last_contacted_at: string | null;
};

export async function GET(req: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const url = new URL(req.url);
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const limit = Math.max(
    1,
    Math.min(500, Number(url.searchParams.get("limit") ?? "200") || 200),
  );

  // Schema mit View-Tracking versuchen; bei fehlender Spalte (Migration noch nicht
  // eingespielt) graceful auf den alten Spaltensatz zurückfallen.
  const FULL_COLUMNS =
    "id, lead_id, token, created_at, opened_at, view_count, last_viewed_at, last_view_app, metadata";
  const LEGACY_COLUMNS = "id, lead_id, token, created_at, opened_at, metadata";

  let demosRes = await ctx.service
    .from("lead_demo_links")
    .select(FULL_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (
    demosRes.error &&
    (demosRes.error.message.toLowerCase().includes("column") ||
      demosRes.error.message.toLowerCase().includes("does not exist"))
  ) {
    const fallback = await ctx.service
      .from("lead_demo_links")
      .select(LEGACY_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);
    demosRes = fallback as unknown as typeof demosRes;
  }

  if (demosRes.error) {
    return NextResponse.json({ error: demosRes.error.message }, { status: 500 });
  }

  const demos = (demosRes.data ?? []) as DemoRow[];
  const leadIds = Array.from(
    new Set(
      demos.map((d) => d.lead_id).filter((id): id is string => typeof id === "string"),
    ),
  );

  const leadsById = new Map<string, LeadRow>();
  if (leadIds.length > 0) {
    const leadsRes = await ctx.service
      .from("leads")
      .select(
        "id, company_name, contact_email, manager_name, lead_segment, stage, last_contacted_at",
      )
      .in("id", leadIds);
    if (leadsRes.error) {
      return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });
    }
    for (const row of (leadsRes.data ?? []) as LeadRow[]) {
      if (row.id) leadsById.set(row.id, row);
    }
  }

  const base = getPublicSiteUrlFromEnv();

  const rows = demos.map((d) => {
    const lead = leadsById.get(d.lead_id) ?? null;
    const tokenUrl = base
      ? `${base}/api/public/demo-link/${encodeURIComponent(d.token)}`
      : null;
    return {
      id: d.id,
      token: d.token,
      created_at: d.created_at,
      opened_at: d.opened_at ?? null,
      view_count: typeof d.view_count === "number" ? d.view_count : 0,
      last_viewed_at: d.last_viewed_at ?? null,
      last_view_app: d.last_view_app ?? null,
      lead_id: d.lead_id,
      company_name: lead?.company_name ?? null,
      contact_email: lead?.contact_email ?? null,
      manager_name: lead?.manager_name ?? null,
      lead_segment: lead?.lead_segment ?? null,
      stage: lead?.stage ?? null,
      last_contacted_at: lead?.last_contacted_at ?? null,
      url_konzern: tokenUrl ? `${tokenUrl}?app=konzern` : null,
      url_worker: tokenUrl ? `${tokenUrl}?app=worker` : null,
      url_konzern_preview: tokenUrl
        ? `${tokenUrl}?app=konzern&admin_preview=1`
        : null,
      url_worker_preview: tokenUrl
        ? `${tokenUrl}?app=worker&admin_preview=1`
        : null,
    };
  });

  const filtered = search
    ? rows.filter((r) => {
        const hay = [
          r.company_name,
          r.contact_email,
          r.manager_name,
          r.token,
          r.lead_segment,
        ]
          .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
          .join(" ");
        return hay.includes(search);
      })
    : rows;

  return NextResponse.json(
    { demos: filtered, total: filtered.length },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
