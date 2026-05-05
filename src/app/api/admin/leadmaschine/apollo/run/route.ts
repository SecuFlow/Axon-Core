import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import {
  loadApolloSettings,
  runApolloDiscoveryForSegment,
  type DiscoveryRunResult,
} from "@/lib/apolloDiscovery.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

/**
 * POST /api/admin/leadmaschine/apollo/run
 * Optional Body: { segment?: "enterprise" | "smb" | "both" }
 *
 * Triggert einen sofortigen Apollo-Discovery-Lauf (manuell, Admin-only).
 * Das Tageslimit aus Settings gilt weiterhin; force=true im Query laesst
 * den `already_ran_today`-Check links liegen, das Tages-Cap (target_count)
 * bleibt aktiv.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  let segmentParam: "enterprise" | "smb" | "both" = "both";
  try {
    const body = (await request.json().catch(() => ({}))) as { segment?: unknown };
    const v = typeof body?.segment === "string" ? body.segment.toLowerCase() : "";
    if (v === "enterprise" || v === "smb" || v === "both") segmentParam = v;
  } catch {
    // leerer Body ok.
  }

  const settings = await loadApolloSettings(ctx.service);
  if (!settings.apollo_enabled) {
    return NextResponse.json(
      {
        error:
          "Apollo-Discovery ist deaktiviert. Bitte zuerst im Admin-UI aktivieren (apollo_enabled=true).",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const segments: Array<"enterprise" | "smb"> =
    segmentParam === "both" ? ["enterprise", "smb"] : [segmentParam];

  const results: DiscoveryRunResult[] = [];
  for (const seg of segments) {
    const r = await runApolloDiscoveryForSegment({
      service: ctx.service,
      segment: seg,
      trigger: "manual",
      settingsOverride: settings,
    });
    results.push(r);
  }

  const totalInserted = results.reduce((acc, r) => acc + r.inserted_count, 0);
  const totalCredits = results.reduce((acc, r) => acc + r.apollo_credits_used, 0);

  return NextResponse.json(
    {
      ok: true,
      results,
      summary: {
        leads_inserted: totalInserted,
        credits_used: totalCredits,
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}
