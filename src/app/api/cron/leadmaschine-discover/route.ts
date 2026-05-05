import { NextResponse } from "next/server";
import { createServiceClientFromEnv } from "@/lib/leadmaschineRunner.server";
import {
  loadApolloSettings,
  runApolloDiscoveryForSegment,
  type DiscoveryRunResult,
} from "@/lib/apolloDiscovery.server";
import { verifyCronAuth } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apollo-Discovery Cron.
 *
 * Schedule: 1x pro Werktag, vor /api/cron/leadmaschine, sodass die ent-
 * staendigen Leads im selben Run von der Outreach-Pipeline aufgegriffen
 * werden koennen (next_action_at = now()).
 *
 * Idempotenz: pro Tag und Segment maximal 1 erfolgreicher Run. Falls heute
 * fuer das jeweilige Segment bereits ein Run existiert (egal ob mit Inserts
 * > 0), wird der Lauf uebersprungen.
 */
async function alreadyRanToday(
  service: Awaited<ReturnType<typeof createServiceClientFromEnv>>,
  segment: "enterprise" | "smb",
): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const res = await service
    .from("apollo_discovery_runs")
    .select("id", { count: "exact", head: true })
    .eq("segment", segment)
    .is("error_message", null)
    .gte("started_at", startOfDay.toISOString());
  if (res.error) return false;
  return (res.count ?? 0) > 0;
}

async function handle(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const service = await createServiceClientFromEnv();
  const settings = await loadApolloSettings(service);

  if (!settings.apollo_enabled) {
    return NextResponse.json({
      ok: true,
      skipped: "apollo_disabled",
      hint: "Im Admin-UI unter Leadmaschine → Apollo-Discovery aktivieren.",
    });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const results: DiscoveryRunResult[] = [];
  for (const segment of ["enterprise", "smb"] as const) {
    if (!force && (await alreadyRanToday(service, segment))) {
      results.push({
        ok: true,
        segment,
        target_count: 0,
        searched_count: 0,
        enriched_count: 0,
        inserted_count: 0,
        skipped_duplicate_count: 0,
        skipped_no_email_count: 0,
        skipped_generic_mailbox_count: 0,
        apollo_credits_used: 0,
        error: "already_ran_today",
      });
      continue;
    }
    const r = await runApolloDiscoveryForSegment({
      service,
      segment,
      trigger: "cron",
      settingsOverride: settings,
    });
    results.push(r);
  }

  return NextResponse.json({ ok: true, results });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
