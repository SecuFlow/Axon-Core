import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=0, stale-while-revalidate=30",
} as const;

function parseStatus(raw: unknown): "on" | "off" | "maintenance" | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("wartung") || s.includes("maintenance")) return "maintenance";
  if (s === "off" || s === "aus" || s.includes("stopp")) return "off";
  if (s === "on" || s === "an" || s.includes("run")) return "on";
  return null;
}

function kwhSavingByStatus(status: "on" | "off" | "maintenance" | null): number {
  if (status === "off") return 4.2;
  if (status === "maintenance") return 2.6;
  if (status === "on") return 1.1;
  return 0.8;
}

export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: CACHE_HEADERS });
  }

  // KPI 1: Demo-Anfragen = Klicks auf Leadmaschine-Demo-Links.
  const demoClicksRes = await ctx.service
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "lead.demo_link_opened");
  if (demoClicksRes.error) {
    return NextResponse.json(
      { error: demoClicksRes.error.message },
      { status: 500, headers: CACHE_HEADERS },
    );
  }
  const demoClicks = demoClicksRes.count ?? 0;

  // KPI 2: Knowledge Rate = alle Fachwissens-Einträge mandantenübergreifend.
  const [aiCasesRes, knowledgeRes] = await Promise.all([
    ctx.service.from("ai_cases").select("id", { count: "exact", head: true }),
    ctx.service
      .from("public_knowledge")
      .select("id", { count: "exact", head: true }),
  ]);
  if (aiCasesRes.error && !aiCasesRes.error.message.includes("ai_cases")) {
    return NextResponse.json(
      { error: aiCasesRes.error.message },
      { status: 500, headers: CACHE_HEADERS },
    );
  }
  if (knowledgeRes.error && !knowledgeRes.error.message.includes("public_knowledge")) {
    return NextResponse.json(
      { error: knowledgeRes.error.message },
      { status: 500, headers: CACHE_HEADERS },
    );
  }
  const knowledgeRate =
    (aiCasesRes.error ? 0 : (aiCasesRes.count ?? 0)) +
    (knowledgeRes.error ? 0 : (knowledgeRes.count ?? 0));

  // KPI 3: Axon Coin Volumen (fiktiv) aus Maschineneffizienz per Status.
  // Datenbasis: ai_cases.machine_status, fallback auf machines.status.
  const [caseStatusRes, machineStatusRes] = await Promise.all([
    ctx.service.from("ai_cases").select("machine_status").limit(20000),
    ctx.service.from("machines").select("status").limit(20000),
  ]);
  if (caseStatusRes.error && !caseStatusRes.error.message.includes("machine_status")) {
    return NextResponse.json(
      { error: caseStatusRes.error.message },
      { status: 500, headers: CACHE_HEADERS },
    );
  }
  if (machineStatusRes.error && !machineStatusRes.error.message.includes("status")) {
    return NextResponse.json(
      { error: machineStatusRes.error.message },
      { status: 500, headers: CACHE_HEADERS },
    );
  }

  const statuses: unknown[] = [];
  if (!caseStatusRes.error) {
    for (const r of caseStatusRes.data ?? []) statuses.push((r as { machine_status?: unknown }).machine_status);
  }
  if (!machineStatusRes.error) {
    for (const r of machineStatusRes.data ?? []) statuses.push((r as { status?: unknown }).status);
  }
  const totalKwhSaving = statuses.reduce<number>(
    (sum, raw) => sum + kwhSavingByStatus(parseStatus(raw)),
    0,
  );

  // AxonCoin-Formel: Maschineneffizienz (kWh-Einsparung × 3.2)
  // + Heilwissen (public_knowledge-Einträge × 2 AXN).
  const knowledgeCount = knowledgeRes.error ? 0 : (knowledgeRes.count ?? 0);
  const axonCoinVolume = Math.round(totalKwhSaving * 3.2 + knowledgeCount * 2);

  return NextResponse.json(
    {
      kpis: {
        demo_requests_clicks: demoClicks,
        knowledge_rate_total_entries: knowledgeRate,
        axon_coin_volume: axonCoinVolume,
      },
    },
    { headers: CACHE_HEADERS },
  );
}

