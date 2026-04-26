import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { getStripeServer } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

type PackageKey = "enterprise" | "smb";

type PricingConfigRow = {
  stripe_price_id?: unknown;
  stripe_price_id_enterprise?: unknown;
  stripe_price_id_smb?: unknown;
};

function asId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function getConfig(ctx: { service: SupabaseClient }) {
  const res = await ctx.service
    .from("pricing_config")
    .select("stripe_price_id, stripe_price_id_enterprise, stripe_price_id_smb, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) return null;
  const row = res.data as PricingConfigRow | null;
  return {
    enterprise: asId(row?.stripe_price_id_enterprise) ?? asId(row?.stripe_price_id),
    smb: asId(row?.stripe_price_id_smb),
  };
}

export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const cfg = await getConfig(ctx);
  const envEnterprise = sanitizeEnv(process.env.STRIPE_PRICE_ID) ?? null;
  const envSmb = sanitizeEnv(process.env.STRIPE_PRICE_ID_SMB) ?? null;
  const stripe = getStripeServer();

  const stripeStatus: "linked" | "missing_secret" = stripe ? "linked" : "missing_secret";
  const activeByPackage = {
    enterprise: cfg?.enterprise ?? envEnterprise,
    smb: cfg?.smb ?? envSmb,
  };

  let enterprisePrice:
    | {
        id: string;
        active: boolean;
        currency: string | null;
        unit_amount: number | null;
        recurring: { interval?: string | null; interval_count?: number | null } | null;
        product: string | null;
      }
    | null = null;
  let smbPrice:
    | {
        id: string;
        active: boolean;
        currency: string | null;
        unit_amount: number | null;
        recurring: { interval?: string | null; interval_count?: number | null } | null;
        product: string | null;
      }
    | null = null;

  if (stripe && activeByPackage.enterprise) {
    try {
      const price = await stripe.prices.retrieve(activeByPackage.enterprise);
      enterprisePrice = {
        id: price.id,
        active: price.active,
        currency: price.currency,
        unit_amount: price.unit_amount,
        recurring: price.recurring ?? null,
        product: typeof price.product === "string" ? price.product : null,
      };
    } catch {
      enterprisePrice = null;
    }
  }
  if (stripe && activeByPackage.smb) {
    try {
      const price = await stripe.prices.retrieve(activeByPackage.smb);
      smbPrice = {
        id: price.id,
        active: price.active,
        currency: price.currency,
        unit_amount: price.unit_amount,
        recurring: price.recurring ?? null,
        product: typeof price.product === "string" ? price.product : null,
      };
    } catch {
      smbPrice = null;
    }
  }

  let available_prices: Array<{
    id: string;
    label: string;
    unit_amount: number | null;
    currency: string | null;
    interval: string | null;
    product_name: string | null;
  }> = [];
  if (stripe) {
    try {
      const list = await stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] });
      available_prices = list.data
        .filter((p) => !!p.recurring)
        .map((p) => {
          const prod = typeof p.product === "object" && p.product ? p.product : null;
          const productName = prod && "name" in prod && typeof prod.name === "string" ? prod.name : null;
          return {
            id: p.id,
            label: `${productName ?? "Produkt"} · ${p.id}`,
            unit_amount: p.unit_amount,
            currency: p.currency ?? null,
            interval: p.recurring?.interval ?? null,
            product_name: productName,
          };
        });
    } catch {
      available_prices = [];
    }
  }

  return NextResponse.json({
    stripe_status: stripeStatus,
    active_price_id_enterprise: activeByPackage.enterprise,
    active_price_id_smb: activeByPackage.smb,
    source: cfg ? "db" : envEnterprise || envSmb ? "env" : null,
    enterprise_price: enterprisePrice,
    smb_price: smbPrice,
    available_prices,
  }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const stripe = getStripeServer();
  if (!stripe) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY fehlt." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  let body: { stripe_price_id?: unknown; package?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const priceId =
    typeof body.stripe_price_id === "string" ? body.stripe_price_id.trim() : "";
  const pkg: PackageKey = body.package === "smb" ? "smb" : "enterprise";
  if (!priceId) {
    return NextResponse.json(
      { error: "stripe_price_id ist erforderlich." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  // Validate against Stripe (fails fast if wrong ID).
  try {
    const p = await stripe.prices.retrieve(priceId);
    if (!p || typeof p.id !== "string") {
      return NextResponse.json(
        { error: "Stripe Price konnte nicht validiert werden." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ungültiger Stripe Price." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const existing = await ctx.service
    .from("pricing_config")
    .select("id")
    .limit(1)
    .maybeSingle();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (pkg === "enterprise") {
    update.stripe_price_id = priceId;
    update.stripe_price_id_enterprise = priceId;
  } else {
    update.stripe_price_id_smb = priceId;
  }

  if (existing.data?.id) {
    const upd = await ctx.service
      .from("pricing_config")
      .update(update)
      .eq("id", existing.data.id);
    if (upd.error) {
      return NextResponse.json(
        { error: upd.error.message },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
  } else {
    const ins = await ctx.service.from("pricing_config").insert(update);
    if (ins.error) {
      if (ins.error.message.includes("pricing_config")) {
        return NextResponse.json(
          { error: "Pricing Config ist noch nicht migriert." },
          { status: 503, headers: NO_STORE_HEADERS },
        );
      }
      return NextResponse.json(
        { error: ins.error.message },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

