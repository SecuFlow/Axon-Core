import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function siteBaseUrl(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function parsePositiveInt(v: string | null): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

/**
 * Upgrade Checkout:
 * - default: target quantity = current locations + 1
 * - optional override: ?target=<n>
 */
export async function POST(req: Request) {
  const stripe = getStripeServer();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe nicht konfiguriert." }, { status: 503 });
  }

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !anon || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase-Konfiguration fehlt." }, { status: 500 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userRes = await userClient.auth.getUser();
  const userId = userRes.data.user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Session ungültig." }, { status: 401 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const profRes = await service
    .from("profiles")
    .select("mandant_id, tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const prof = profRes.data as { mandant_id?: string | null; tenant_id?: string | null } | null;
  const tenantId = (prof?.mandant_id ?? prof?.tenant_id ?? "").trim();
  if (!tenantId) {
    return NextResponse.json({ error: "Kein Mandanten-Scope." }, { status: 403 });
  }

  const url = new URL(req.url);
  const targetOverride = parsePositiveInt(url.searchParams.get("target"));

  const locCountRes = await service
    .from("locations")
    .select("id", { head: true, count: "exact" })
    .eq("company_id", tenantId);
  const currentLocations = typeof locCountRes.count === "number" ? locCountRes.count : 0;

  const targetQuantity = Math.max(1, targetOverride ?? currentLocations + 1);

  const priceId =
    process.env.STRIPE_PRICE_LOCATION_MONTHLY?.trim() ||
    process.env.STRIPE_PRICE_ID?.trim() ||
    "";
  if (!priceId) {
    return NextResponse.json(
      { error: "Stripe Price fehlt (STRIPE_PRICE_LOCATION_MONTHLY)." },
      { status: 503 },
    );
  }

  const base = siteBaseUrl(req);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: targetQuantity }],
    success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/checkout?canceled=1`,
    client_reference_id: userId,
    metadata: {
      supabase_user_id: userId,
      tenant_id: tenantId,
      source: "upgrade",
      current_locations: String(currentLocations),
      target_quantity: String(targetQuantity),
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Checkout konnte nicht erstellt werden." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    url: session.url,
    current_locations: currentLocations,
    target_quantity: targetQuantity,
  });
}

