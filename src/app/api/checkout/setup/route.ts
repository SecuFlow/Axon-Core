import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripeServer";
import { runPostPaymentSetup } from "@/lib/stripePostPayment.server";

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

  let body: { session_id?: string } = {};
  try {
    body = (await req.json()) as { session_id?: string };
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }
  const sessionId = (body.session_id ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "session_id fehlt." }, { status: 400 });
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

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const ownerId =
    (typeof session.client_reference_id === "string" ? session.client_reference_id : "") ||
    (typeof session.metadata?.supabase_user_id === "string" ? session.metadata.supabase_user_id : "");
  if (!ownerId || ownerId !== userId) {
    return NextResponse.json({ error: "Session gehört nicht zum aktuellen Nutzer." }, { status: 403 });
  }
  if (session.status !== "complete") {
    return NextResponse.json({ ok: false, state: "pending", detail: "Checkout noch nicht abgeschlossen." });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const base = siteBaseUrl(req);
  const result = await runPostPaymentSetup({
    service,
    session,
    dashboardBaseUrl: base,
    trigger: "success_page",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, state: "error", detail: result.reason }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    state: "ready",
    dashboard_url: result.dashboardUrl,
  });
}

