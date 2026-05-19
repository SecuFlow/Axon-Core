import { NextResponse } from "next/server";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveActorMandantId } from "@/lib/mandantScope";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Smoke-Test für Pilotbetrieb: prüft Tenant-/Scope-Stabilität im Dashboard-Kontext.
 * Aufruf im eingeloggten Konzern-Dashboard (Browser): `/api/dashboard/diagnostic-scope`
 */
export async function GET() {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  const actorMandantId = ctx.isAdmin ? null : await resolveActorMandantId(ctx.service, ctx.userId);

  // Quick health: Branding-Scope muss tenant-gebunden sein für Nicht-Plattform-Admins.
  const scopeOk = ctx.isAdmin ? true : Boolean(ctx.tenantId && actorMandantId && ctx.tenantId === actorMandantId);

  let subscription: {
    is_subscribed: boolean;
    subscription_status: string | null;
    subscription_quantity: number | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_price_id: string | null;
    current_period_end: string | null;
  } | null = null;
  if (!ctx.isAdmin && actorMandantId) {
    try {
      const res = await ctx.service
        .from("companies")
        .select(
          "is_subscribed, subscription_status, subscription_quantity, stripe_customer_id, stripe_subscription_id, stripe_price_id, current_period_end",
        )
        .eq("tenant_id", actorMandantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const row = res.data as
        | {
            is_subscribed?: boolean | null;
            subscription_status?: string | null;
            subscription_quantity?: number | null;
            stripe_customer_id?: string | null;
            stripe_subscription_id?: string | null;
            stripe_price_id?: string | null;
            current_period_end?: string | null;
          }
        | null;
      if (row) {
        subscription = {
          is_subscribed: row.is_subscribed === true,
          subscription_status:
            typeof row.subscription_status === "string" ? row.subscription_status : null,
          subscription_quantity:
            typeof row.subscription_quantity === "number" && Number.isFinite(row.subscription_quantity)
              ? row.subscription_quantity
              : null,
          stripe_customer_id:
            typeof row.stripe_customer_id === "string" ? row.stripe_customer_id : null,
          stripe_subscription_id:
            typeof row.stripe_subscription_id === "string" ? row.stripe_subscription_id : null,
          stripe_price_id:
            typeof row.stripe_price_id === "string" ? row.stripe_price_id : null,
          current_period_end:
            typeof row.current_period_end === "string" ? row.current_period_end : null,
        };
      }
    } catch {
      // legacy schemas without stripe/subscription columns: ignore
    }
  }

  // Minimal DB cross-check: wie viele Profiles liegen auf diesem Mandanten?
  let profilesOnMandant = 0;
  if (!ctx.isAdmin && actorMandantId) {
    const res = await ctx.service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("mandant_id", actorMandantId);
    profilesOnMandant = typeof res.count === "number" ? res.count : 0;
  }

  return NextResponse.json(
    {
      ok: scopeOk,
      context: {
        userId: ctx.userId,
        isPlatformAdmin: ctx.isAdmin,
        tenantId: ctx.tenantId,
        actorMandantId,
      },
      checks: {
        scope_matches: scopeOk,
        profiles_on_mandant: profilesOnMandant,
      },
      subscription,
      hint:
        "Wenn `scope_matches=false` ist, besteht ein Risiko für Mandanten-Leaks. Dann bitte nicht pilotieren, bevor das gefixt ist.",
      generated_at: new Date().toISOString(),
    },
    { headers: NO_STORE_HEADERS },
  );
}

