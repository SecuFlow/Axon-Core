import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { resolveDemoCompanyByParam } from "@/lib/resolveDemoCompanyByParam.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const companyParam = url.searchParams.get("company") ?? "";

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server nicht konfiguriert." }, { status: 503 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resolved = await resolveDemoCompanyByParam(service, companyParam, {
    allowInactiveDemo: true,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }

  const co = resolved.row;
  const companyId = resolved.companyId;
  const tenantId = co.tenant_id;

  const { data: locations } = await service
    .from("locations")
    .select("id,name,address,created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(20);

  const machinesRes = await service
    .from("machines")
    .select("id,name,serial_number,status,location_id,created_at")
    .in("company_id", [companyId])
    .order("created_at", { ascending: true })
    .limit(50);
  const machines = machinesRes.data;

  // Debug/Guard: falls Demo-Daten inkonsistent sind, sehen wir es direkt.
  const { data: debugDemoMachines } = await service
    .from("machines")
    .select("id,serial_number,company_id,created_at")
    .ilike("serial_number", "DEMO-%")
    .order("created_at", { ascending: false })
    .limit(10);

  const ids = (machines ?? []).map((m) => (m as { id: string }).id);
  const { data: machineLogs } =
    ids.length === 0
      ? { data: [] as unknown[] }
      : await service
          .from("machine_logs")
          .select("id,machine_id,created_at,action,detail,status_after")
          .in("machine_id", ids)
          .order("created_at", { ascending: false })
          .limit(200);

  const { data: auditLogs } = await service
    .from("audit_logs")
    .select("id,created_at,action,description,metadata")
    .eq("tenant_id", tenantId && tenantId.trim() ? tenantId : companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json(
    {
      company: {
        id: companyId,
        tenant_id: typeof tenantId === "string" ? tenantId : null,
        name: co.name ?? null,
        brand_name: co.brand_name ?? null,
        logo_url: co.logo_url ?? null,
        primary_color: co.primary_color ?? null,
      },
      locations: locations ?? [],
      machines: machines ?? [],
      machine_logs: machineLogs ?? [],
      audit_logs: auditLogs ?? [],
      counts: {
        machines: (machines ?? []).length,
        machine_logs: (machineLogs ?? []).length,
        audit_logs: (auditLogs ?? []).length,
      },
      debug: {
        demo_machines_sample: debugDemoMachines ?? [],
        machines_filter_error: machinesRes.error?.message ?? null,
        machines_filter_company_id: companyId,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}

