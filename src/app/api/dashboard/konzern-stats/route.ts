import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveKonzernDataScopeAsync } from "@/lib/resolveKonzernDataScopeAsync";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveDemoGuestContextFromRequest } from "@/lib/demoGuestContext.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanitizeEnv = (value: string | undefined) =>
  value ? value.replace(/\s/g, "") : undefined;

/**
 * Live-Kennzahlen für das Konzern-Dashboard (mandanten- bzw. admin-global).
 * Query `company_id` oder `tenantId`: nur Plattform-Admins — Filter auf diesen Mandanten (Spalte `company_id`).
 */
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

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  );

  let securedCount = 0;

  if (ctx.isAdmin && scope.kind === "global_admin") {
    const aiAll = await ctx.service
      .from("ai_cases")
      .select("*", { count: "exact", head: true });
    if (aiAll.error && !aiAll.error.message.includes("ai_cases")) {
      return NextResponse.json({ error: aiAll.error.message }, { status: 500 });
    }
    const pk = await ctx.service
      .from("public_knowledge")
      .select("*", { count: "exact", head: true });
    if (pk.error && !pk.error.message.includes("public_knowledge")) {
      return NextResponse.json({ error: pk.error.message }, { status: 500 });
    }
    securedCount = (aiAll.error ? 0 : (aiAll.count ?? 0)) + (pk.error ? 0 : (pk.count ?? 0));
  } else if (scope.kind === "tenant") {
    const scopedTenant = scope.tenantId;
    const q = ctx.service
      .from("ai_cases")
      .select("*", { count: "exact", head: true })
      .or(`company_id.eq.${scopedTenant},tenant_id.eq.${scopedTenant}`);
    const tenantAi = await q;
    if (tenantAi.error?.message.includes("tenant_id")) {
      const fb = await ctx.service
        .from("ai_cases")
        .select("*", { count: "exact", head: true })
        .eq("company_id", scopedTenant);
      if (fb.error) {
        return NextResponse.json({ error: fb.error.message }, { status: 500 });
      }
      securedCount = fb.count ?? 0;
    } else if (tenantAi.error) {
      return NextResponse.json({ error: tenantAi.error.message }, { status: 500 });
    } else {
      securedCount = tenantAi.count ?? 0;
    }
  }

  // Aktive Experten: eingeloggte Mitarbeiter-App-Nutzer in den letzten 30 Tagen.
  // Quelle: profiles mit role = 'mitarbeiter'/'worker' innerhalb Scope + Auth-User-Lookup.
  const workerRoles = ["mitarbeiter", "worker"];
  const workerProfilesRes =
    scope.kind === "tenant"
      ? await ctx.service
          .from("profiles")
          .select("id, role")
          .eq("tenant_id", scope.tenantId)
          .in("role", workerRoles)
      : await ctx.service
          .from("profiles")
          .select("id, role")
          .in("role", workerRoles);
  if (workerProfilesRes.error) {
    return NextResponse.json({ error: workerProfilesRes.error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      (workerProfilesRes.data ?? [])
        .map((r) => (r as { id?: string | null }).id)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    ),
  );

  let activeExperts = 0;
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (supabaseUrl && serviceRoleKey && userIds.length > 0) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const userId of userIds) {
      const userRes = await admin.auth.admin.getUserById(userId);
      const lastSignIn = userRes.data.user?.last_sign_in_at ?? null;
      if (!lastSignIn) continue;
      const ts = new Date(lastSignIn).getTime();
      if (Number.isFinite(ts) && ts >= thirtyDaysAgo.getTime()) {
        activeExperts += 1;
      }
    }
  }

  return NextResponse.json({
    secured_knowledge_count: securedCount,
    active_experts_count: activeExperts,
    secured_caption: "Wissens-Einträge",
    experts_caption: `eingeloggt in den letzten 30 Tagen`,
  });
}
