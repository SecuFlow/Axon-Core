import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/auditLog";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveMandantTenantId } from "@/lib/resolveMandantTenantId";
import { applyMandantFilter, resolveActorMandantId } from "@/lib/mandantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const coreSelect =
  "id,created_at,analysis_text,original_priority,priority_override,machine_id,required_part,machine_status,mandant_id,machine:machines(name)";
const syncSelect =
  "manager_public_approved,manager_public_approved_at,worker_rewarded_at,worker_public_shared_at";

export async function GET(request: NextRequest) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const actorMandantId = ctx.isAdmin
    ? null
    : await resolveActorMandantId(ctx.service, ctx.userId);

  const daysRaw = request.nextUrl.searchParams.get("days") ?? "10";
  const days = Math.max(1, Math.min(30, Number(daysRaw) || 10));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rawTenantParam = (
    request.nextUrl.searchParams.get("tenantId") ??
    request.nextUrl.searchParams.get("company_id") ??
    ""
  ).trim();

  let filterTenant: string | null = null;
  if (ctx.isAdmin) {
    if (rawTenantParam) {
      filterTenant = await resolveMandantTenantId(ctx.service, rawTenantParam);
      if (!filterTenant) {
        return NextResponse.json(
          { error: "Unbekannter Mandant (tenantId/company_id)." },
          { status: 400 },
        );
      }
    }
  } else {
    filterTenant = actorMandantId ?? ctx.tenantId;
    if (!filterTenant) {
      return NextResponse.json(
        { error: "Kein Mandanten-Kontext." },
        { status: 403 },
      );
    }
  }

  const { service } = ctx;

  async function trySelect(
    includePhotoUrls: boolean,
    useCompanyOnlyFallback: boolean,
    includeSyncState: boolean,
  ) {
    const sel = [
      coreSelect,
      includePhotoUrls ? "photo_urls" : null,
      includeSyncState ? syncSelect : null,
    ]
      .filter(Boolean)
      .join(",");
    let q = service
      .from("ai_cases")
      .select(sel)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (filterTenant) {
      if (useCompanyOnlyFallback) {
        q = q.eq("tenant_id", filterTenant);
      } else {
        q = applyMandantFilter(q, filterTenant);
      }
    }

    return q;
  }

  let res = await trySelect(true, false, true);

  if (!res.error) {
    return NextResponse.json({ days, cases: res.data ?? [] });
  }

  let errMsg = res.error.message ?? "";

  if (errMsg.includes("column ai_cases.photo_urls does not exist")) {
    res = await trySelect(false, false, true);
    if (!res.error) {
      return NextResponse.json({ days, cases: res.data ?? [] });
    }
    errMsg = res.error.message ?? "";
  }

  if (errMsg.includes("column ai_cases.company_id does not exist")) {
    res = await trySelect(true, true, true);
    if (!res.error) {
      return NextResponse.json({ days, cases: res.data ?? [] });
    }
    errMsg = res.error.message ?? "";
    if (errMsg.includes("column ai_cases.photo_urls does not exist")) {
      res = await trySelect(false, true, true);
      if (!res.error) {
        return NextResponse.json({ days, cases: res.data ?? [] });
      }
    }
    errMsg = res.error?.message ?? errMsg;
  }

  if (
    errMsg.includes("manager_public_approved") ||
    errMsg.includes("worker_rewarded_at") ||
    errMsg.includes("worker_public_shared_at")
  ) {
    res = await trySelect(true, false, false);
    if (res.error?.message.includes("column ai_cases.photo_urls does not exist")) {
      res = await trySelect(false, false, false);
    }
    if (!res.error) {
      return NextResponse.json({ days, cases: res.data ?? [] });
    }
    errMsg = res.error.message ?? errMsg;
  }

  return NextResponse.json({ error: errMsg }, { status: 500 });
}

const MACHINE_STATUSES = new Set(["active", "maintenance", "offline"]);

export async function PATCH(request: NextRequest) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ungültige Request-Body." }, { status: 400 });
  }

  const { id, machine_status: nextStatusRaw } = payload as {
    id?: string;
    machine_status?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  }

  if (nextStatusRaw === undefined || typeof nextStatusRaw !== "string") {
    return NextResponse.json(
      { error: "machine_status fehlt oder ungültig." },
      { status: 400 },
    );
  }

  const nextStatus = nextStatusRaw.trim().toLowerCase();
  if (!MACHINE_STATUSES.has(nextStatus)) {
    return NextResponse.json(
      { error: "machine_status muss active, maintenance oder offline sein." },
      { status: 400 },
    );
  }

  const rawTenantParam = (
    request.nextUrl.searchParams.get("tenantId") ??
    request.nextUrl.searchParams.get("company_id") ??
    ""
  ).trim();

  let filterTenant: string | null = null;
  if (ctx.isAdmin) {
    if (rawTenantParam) {
      filterTenant = await resolveMandantTenantId(ctx.service, rawTenantParam);
      if (!filterTenant) {
        return NextResponse.json(
          { error: "Unbekannter Mandant (tenantId/company_id)." },
          { status: 400 },
        );
      }
    }
  } else {
    filterTenant = ctx.tenantId;
    if (!filterTenant) {
      return NextResponse.json(
        { error: "Kein Mandanten-Kontext." },
        { status: 403 },
      );
    }
  }

  const { service, userId } = ctx;

  const { data: row, error: selErr } = await service
    .from("ai_cases")
    .select("id, mandant_id, tenant_id, company_id, machine_status")
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Fall nicht gefunden." }, { status: 404 });
  }

  const caseRow = row as {
    tenant_id?: string | null;
    mandant_id?: string | null;
    company_id?: string | null;
    machine_status?: string | null;
  };

  const caseTenant =
    (typeof caseRow.mandant_id === "string" && caseRow.mandant_id
      ? caseRow.mandant_id
      : null) ??
    (typeof caseRow.tenant_id === "string" && caseRow.tenant_id
      ? caseRow.tenant_id
      : null) ??
    (typeof caseRow.company_id === "string" && caseRow.company_id
      ? caseRow.company_id
      : null);

  if (!ctx.isAdmin) {
    if (!caseTenant || caseTenant !== filterTenant) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Fall." }, { status: 403 });
    }
  } else if (filterTenant && caseTenant && caseTenant !== filterTenant) {
    return NextResponse.json({ error: "Fall gehört nicht zum gewählten Mandanten." }, { status: 403 });
  }

  const prev = caseRow.machine_status ?? null;
  if (prev === nextStatus) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error: upErr } = await service
    .from("ai_cases")
    .update({ machine_status: nextStatus })
    .eq("id", id);

  if (upErr) {
    if (upErr.message?.includes("machine_status")) {
      return NextResponse.json(
        { error: "machine_status-Spalte nicht verfügbar." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  let companyPk: string | null = null;
  if (caseTenant) {
    const { data: co } = await service
      .from("companies")
      .select("id")
      .eq("tenant_id", caseTenant)
      .maybeSingle();
    companyPk = (co as { id?: string } | null)?.id ?? null;
  }

  void logEvent(
    "repair_case.machine_status_changed",
    `Maschinen-Status des Reparaturfalls geändert (${prev ?? "—"} → ${nextStatus}).`,
    { previous: prev, next: nextStatus },
    {
      service,
      userId,
      companyId: companyPk,
      tenantId: caseTenant,
      aiCaseId: id,
    },
  );

  return NextResponse.json({ ok: true });
}
