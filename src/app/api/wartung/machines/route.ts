import { NextResponse } from "next/server";
import { fetchMachinesWithLocations } from "@/lib/fetchMachines";
import { resolveKonzernDataScopeAsync } from "@/lib/resolveKonzernDataScopeAsync";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveDemoGuestContextFromRequest } from "@/lib/demoGuestContext.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function firstSolutionStep(raw: unknown): string {
  if (Array.isArray(raw) && raw.length > 0 && raw[0] != null) {
    return String(raw[0]).trim();
  }
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j) && j[0] != null) return String(j[0]).trim();
    } catch {
      return "";
    }
  }
  return "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const isDemo = url.searchParams.has("demo");
  const ctx = isDemo
    ? await (async () => {
        const demo = await resolveDemoGuestContextFromRequest(request);
        if (!demo.ok) return demo;
        return {
          ok: true as const,
          service: demo.service,
          userId: "demo",
          tenantId: demo.tenantId,
          isAdmin: false,
          companyRole: "user",
        };
      })()
    : await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const scope = await resolveKonzernDataScopeAsync(ctx.service, ctx, request);
  if (scope.kind === "invalid") {
    return NextResponse.json({ error: scope.error }, { status: 400 });
  }
  const useGlobalAdminFleet = ctx.isAdmin && scope.kind === "global_admin";
  const fleetTenantId = scope.kind === "tenant" ? scope.tenantId : null;

  const canEditSerial = ctx.isAdmin || ctx.companyRole === "manager";

  const { machines: listRaw, error: fmErr } = await fetchMachinesWithLocations(
    ctx.service,
    {
      tenantId: fleetTenantId,
      isAdmin: useGlobalAdminFleet,
    },
  );

  if (fmErr) {
    return NextResponse.json({ error: fmErr.message }, { status: 500 });
  }

  const list = listRaw.map(({ locations: loc, ...rest }) => ({
    ...rest,
    location_name: loc?.name ?? null,
  }));

  const ids = list.map((m) => m.id);
  if (ids.length === 0) {
    return NextResponse.json({ machines: list, can_edit_serial: canEditSerial });
  }

  const baseLogsQuery = (select: string) =>
    ctx.service
      .from("machine_logs")
      .select(select)
      .in("machine_id", ids)
      .order("created_at", { ascending: false })
      .limit(400);

  let logsRes = await baseLogsQuery(
    "id, machine_id, created_at, action, detail, status_after, ai_case_id",
  );
  if (logsRes.error?.message?.includes("column machine_logs.action does not exist")) {
    logsRes = await baseLogsQuery("id, machine_id, created_at, ai_case_id");
  }

  if (logsRes.error) {
    return NextResponse.json({ error: logsRes.error.message }, { status: 500 });
  }

  const rawLogs = logsRes.data ?? [];

  const caseIds = [
    ...new Set(
      (rawLogs ?? [])
        .map((l) => (l as { ai_case_id?: string | null }).ai_case_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  ];

  const caseMap = new Map<
    string,
    { analysis_text: string | null; solution_steps: unknown }
  >();

  if (caseIds.length > 0) {
    const { data: cases, error: cErr } = await ctx.service
      .from("ai_cases")
      .select("id, analysis_text, solution_steps")
      .in("id", caseIds);

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    for (const c of cases ?? []) {
      const row = c as {
        id: string;
        analysis_text: string | null;
        solution_steps: unknown;
      };
      caseMap.set(row.id, {
        analysis_text: row.analysis_text,
        solution_steps: row.solution_steps,
      });
    }
  }

  const logsByMachine = new Map<string, ReturnType<typeof formatLog>[]>();

  function formatLog(log: {
    id: string;
    machine_id: string;
    created_at: string | null;
    action: string;
    detail: string | null;
    status_after: string | null;
    ai_case_id: string | null;
  }) {
    const ac = log.ai_case_id ? caseMap.get(log.ai_case_id) : undefined;
    const errorText =
      (ac?.analysis_text?.trim() || log.detail?.trim() || "—").slice(0, 280);
    const fromCase = firstSolutionStep(ac?.solution_steps);
    const solutionText = (
      fromCase ||
      (log.status_after ? `Status: ${log.status_after}` : "") ||
      (log.action !== "voice_report" ? log.action : "Sprachmeldung") ||
      "—"
    ).slice(0, 280);
    return {
      id: log.id,
      created_at: log.created_at,
      error: errorText,
      solution: solutionText,
      status_after: log.status_after,
    };
  }

  for (const row of rawLogs ?? []) {
    const log = row as unknown as {
      id: string;
      machine_id: string;
      created_at: string | null;
      action?: string;
      detail?: string | null;
      status_after?: string | null;
      ai_case_id: string | null;
    };
    const arr = logsByMachine.get(log.machine_id) ?? [];
    if (arr.length < 30) {
      arr.push(
        formatLog({
          id: log.id,
          machine_id: log.machine_id,
          created_at: log.created_at,
          action: typeof log.action === "string" ? log.action : "log",
          detail: log.detail ?? null,
          status_after: log.status_after ?? null,
          ai_case_id: log.ai_case_id,
        }),
      );
      logsByMachine.set(log.machine_id, arr);
    }
  }

  const out = list.map((m) => ({
    ...m,
    logs: logsByMachine.get(m.id) ?? [],
  }));

  return NextResponse.json({ machines: out, can_edit_serial: canEditSerial });
}
