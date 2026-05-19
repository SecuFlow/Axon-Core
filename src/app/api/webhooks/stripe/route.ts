import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeServer } from "@/lib/stripeServer";
import { runPostPaymentSetup } from "@/lib/stripePostPayment.server";

export const dynamic = "force-dynamic";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

function safeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function findUserIdByEmail(
  service: SupabaseClient,
  email: string,
): Promise<string | null> {
  let page = 1;
  while (page <= 5) {
    const listed = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) return null;
    const found = listed.data.users.find(
      (u: { email?: string | null; id?: string | null }) =>
        (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (found?.id) return found.id;
    if (listed.data.users.length < 200) break;
    page += 1;
  }
  return null;
}

function randomTempPassword(): string {
  return `Axon!${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

async function provisionManagerForMandate(
  service: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const companiesTable = service.from("companies");
  const profilesTable = service.from("profiles");
  const mandatesTable = service.from("mandates");
  const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
  if (meta.provisioning_type !== "mandate_manager") return;

  const mandateId = safeText(meta.mandate_id);
  const tenantId = safeText(meta.mandate_tenant_id);
  const managerEmail = safeText(meta.manager_email)?.toLowerCase() ?? null;
  const managerName = safeText(meta.manager_name) ?? "Mandat Manager";
  if (!mandateId || !tenantId || !managerEmail) return;

  const mandateRow = await mandatesTable
    .select("id,account_user_id,title")
    .eq("id", mandateId)
    .maybeSingle();
  if (mandateRow.error || !mandateRow.data) return;
  const mandate = mandateRow.data as {
    id: string;
    account_user_id?: string | null;
    title?: string | null;
  };
  if (typeof mandate.account_user_id === "string" && mandate.account_user_id.trim()) {
    return;
  }

  let managerUserId = await findUserIdByEmail(service, managerEmail);
  if (!managerUserId) {
    const created = await service.auth.admin.createUser({
      email: managerEmail,
      password: randomTempPassword(),
      email_confirm: true,
      user_metadata: {
        first_name: managerName,
        role: "manager",
      },
      app_metadata: {
        role: "manager",
      },
    });
    if (created.error || !created.data.user?.id) return;
    managerUserId = created.data.user.id;
  }

  let managerCompanyId: string | null = null;
  const existingCompany = await service
    .from("companies")
    .select("id")
    .eq("user_id", managerUserId)
    .maybeSingle();
  if (existingCompany.data) {
    const existingId = (existingCompany.data as { id?: string | null }).id ?? null;
    managerCompanyId = existingId;
    if (existingId) {
      await companiesTable
        .update({
          role: "manager",
          is_subscribed: true,
          tenant_id: tenantId,
          mandant_id: tenantId,
        })
        .eq("id", existingId);
    }
  } else {
    const inserted = await companiesTable
      .insert({
        user_id: managerUserId,
        name: `${managerName} (${mandate.title ?? "Mandat"})`,
        role: "manager",
        is_subscribed: true,
        tenant_id: tenantId,
        mandant_id: tenantId,
      })
      .select("id")
      .single();
    managerCompanyId = (inserted.data as { id?: string | null } | null)?.id ?? null;
  }

  await profilesTable.upsert(
    {
      id: managerUserId,
      role: "manager",
      company_id: managerCompanyId,
      tenant_id: tenantId,
      mandant_id: tenantId,
      must_change_password: true,
    },
    { onConflict: "id" },
  );

  await mandatesTable
    .update({ account_user_id: managerUserId })
    .eq("id", mandateId);
}

/**
 * Idempotency-Guard:
 * - Versucht ein INSERT auf stripe_events (PK = event.id).
 * - Erfolg → wir verarbeiten den Event genau einmal.
 * - Unique-Violation oder bereits abgeschlossener Eintrag → idempotenter Skip.
 * - Fallback: wenn die Tabelle (noch) nicht existiert, wird ohne Idempotency
 *   gearbeitet, damit der Webhook während ausstehender Migration nicht hart bricht.
 */
async function claimStripeEvent(
  service: SupabaseClient,
  event: Stripe.Event,
): Promise<
  | { ok: true; tableMissing: boolean }
  | { ok: false; idempotent: true; status: string }
> {
  const insert = await service
    .from("stripe_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      status: "processing",
    });

  if (!insert.error) {
    return { ok: true, tableMissing: false };
  }

  const msg = insert.error.message?.toLowerCase() ?? "";
  if (msg.includes("stripe_events") && msg.includes("does not exist")) {
    console.warn(
      "[stripe webhook] stripe_events Tabelle fehlt — Migration ausstehend; verarbeite ohne Idempotency-Sperre.",
    );
    return { ok: true, tableMissing: true };
  }

  if (msg.includes("duplicate") || msg.includes("unique")) {
    const existing = await service
      .from("stripe_events")
      .select("status")
      .eq("event_id", event.id)
      .maybeSingle();
    const status =
      (existing.data as { status?: string } | null)?.status ?? "processing";
    return { ok: false, idempotent: true, status };
  }

  // Anderer DB-Fehler beim Insert: nicht idempotent skipen, sondern verarbeiten,
  // damit der Webhook eine sinnvolle Antwort an Stripe geben kann.
  console.warn("[stripe webhook] stripe_events insert fehlgeschlagen:", insert.error.message);
  return { ok: true, tableMissing: false };
}

async function markStripeEvent(
  service: SupabaseClient,
  eventId: string,
  status: "completed" | "failed",
  errorText?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    processed_at: new Date().toISOString(),
  };
  if (errorText) patch.error_text = errorText.slice(0, 2000);
  const res = await service
    .from("stripe_events")
    .update(patch)
    .eq("event_id", eventId);
  if (res.error && !res.error.message.toLowerCase().includes("does not exist")) {
    console.warn(
      "[stripe webhook] stripe_events status update fehlgeschlagen:",
      res.error.message,
    );
  }
}

async function updateCompanySubscriptionState(
  service: SupabaseClient,
  input: {
    userId?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    status?: string | null;
    priceId?: string | null;
    quantity?: number | null;
    currentPeriodEnd?: number | null;
    cancelAtPeriodEnd?: boolean | null;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.stripeCustomerId) patch.stripe_customer_id = input.stripeCustomerId;
  if (input.stripeSubscriptionId) patch.stripe_subscription_id = input.stripeSubscriptionId;
  if (input.status) patch.subscription_status = input.status;
  if (input.priceId) patch.stripe_price_id = input.priceId;
  if (typeof input.quantity === "number" && Number.isFinite(input.quantity)) {
    patch.subscription_quantity = input.quantity;
  }
  if (typeof input.currentPeriodEnd === "number" && Number.isFinite(input.currentPeriodEnd)) {
    patch.current_period_end = new Date(input.currentPeriodEnd * 1000).toISOString();
  }
  if (typeof input.cancelAtPeriodEnd === "boolean") {
    patch.cancel_at_period_end = input.cancelAtPeriodEnd;
  }

  // Ohne Spalten im Schema sollen wir nicht hart failen.
  const byUser = input.userId ? await service.from("companies").update(patch).eq("user_id", input.userId) : null;
  const byCust = !input.userId && input.stripeCustomerId
    ? await service.from("companies").update(patch).eq("stripe_customer_id", input.stripeCustomerId)
    : null;
  const errMsg =
    (byUser as { error?: { message?: string } } | null)?.error?.message ??
    (byCust as { error?: { message?: string } } | null)?.error?.message ??
    "";
  if (
    errMsg.toLowerCase().includes("stripe_") ||
    errMsg.toLowerCase().includes("subscription_") ||
    errMsg.toLowerCase().includes("current_period_end") ||
    errMsg.toLowerCase().includes("cancel_at_period_end")
  ) {
    // ignore legacy schema
    return;
  }
}

/**
 * Stripe → companies.is_subscribed per Auth-UUID in user_id.
 */
export async function POST(req: Request) {
  const stripe = getStripeServer();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe-Webhook nicht konfiguriert." },
      { status: 500 },
    );
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "stripe-signature fehlt" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Ungültige Signatur" }, { status: 400 });
  }

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase Service Role fehlt." },
      { status: 500 },
    );
  }

  const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const claim = await claimStripeEvent(supabaseService, event);
  if (!claim.ok) {
    // Bereits verarbeitet (oder gerade in Bearbeitung) → idempotent OK.
    return NextResponse.json({
      received: true,
      idempotent: true,
      previous_status: claim.status,
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      await provisionManagerForMandate(supabaseService, session);
      const host =
        req.headers.get("x-forwarded-host") ??
        req.headers.get("host") ??
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, "") ??
        "";
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      const base =
        process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ??
        `${proto}://${host}`;
      await runPostPaymentSetup({
        service: supabaseService,
        session,
        dashboardBaseUrl: base,
        trigger: "webhook",
      });

      // Best-effort: subscription/customer IDs persistieren.
      await updateCompanySubscriptionState(supabaseService, {
        userId: safeText(session.client_reference_id) ?? safeText(session.metadata?.supabase_user_id) ?? null,
        stripeCustomerId: safeText(session.customer) ?? null,
        stripeSubscriptionId: safeText(session.subscription) ?? null,
        status: "active",
      });
    } catch (setupError) {
      const message =
        setupError instanceof Error ? setupError.message : String(setupError);
      console.error("[stripe webhook] post payment setup:", message);
      await markStripeEvent(supabaseService, event.id, "failed", message);
      return NextResponse.json(
        { error: "Post-Payment Setup fehlgeschlagen." },
        { status: 500 },
      );
    }
  } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const item = sub.items?.data?.[0] ?? null;
    const priceId = typeof item?.price?.id === "string" ? item.price.id : null;
    const quantity = typeof item?.quantity === "number" ? item.quantity : null;
    const anySub = sub as unknown as { current_period_end?: unknown };
    const currentPeriodEnd =
      typeof anySub?.current_period_end === "number" ? anySub.current_period_end : null;
    await updateCompanySubscriptionState(supabaseService, {
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : null,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      priceId,
      quantity,
      currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? null,
    });
  } else if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const custId = typeof invoice.customer === "string" ? invoice.customer : null;
    if (custId) {
      await updateCompanySubscriptionState(supabaseService, {
        stripeCustomerId: custId,
        status: event.type === "invoice.payment_failed" ? "past_due" : "active",
      });
    }
  }

  await markStripeEvent(supabaseService, event.id, "completed");
  return NextResponse.json({ received: true });
}
