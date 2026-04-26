import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getGmailClient, getGmailUserEmail } from "@/lib/gmailClient.server";
import { logEvent } from "@/lib/auditLog";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRfc822Email(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const subject = input.subject.replace(/\r?\n/g, " ").trim();
  const body = input.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    "",
  ].join("\r\n");
}

async function ensureFirstMandate(input: {
  service: SupabaseClient;
  tenantId: string;
  userId: string;
  companyName: string;
}) {
  const { service, tenantId, userId, companyName } = input;
  const existing = await service
    .from("mandates")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id as string;

  const title = companyName || "Hauptmandat";
  const created = await service
    .from("mandates")
    .insert({
      tenant_id: tenantId,
      title: title.slice(0, 120),
      description: "Automatisch nach erfolgreicher Stripe-Zahlung angelegt.",
      account_user_id: userId,
    })
    .select("id")
    .single();
  if (created.error) {
    if (created.error.message.toLowerCase().includes("duplicate")) {
      const fallback = await service
        .from("mandates")
        .select("id")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return (fallback.data as { id?: string } | null)?.id ?? null;
    }
    throw new Error(created.error.message);
  }
  return (created.data as { id?: string } | null)?.id ?? null;
}

async function sendWelcomeEmail(input: {
  to: string;
  dashboardUrl: string;
  companyName: string;
}) {
  const to = clean(input.to);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  const from = getGmailUserEmail();
  const subject = "Willkommen bei AXON Core - Ihr Dashboard ist bereit";
  const body = [
    `Hallo ${input.companyName || "Team"},`,
    "",
    "Ihre Zahlung war erfolgreich. Ihr Konzern-Dashboard wird gerade eingerichtet.",
    "",
    `Direktlink: ${input.dashboardUrl}`,
    "",
    "Wenn die Seite noch vorbereitet wird, bitte kurz warten und neu laden.",
    "",
    "Viele Grüße",
    "AXON Core",
  ].join("\n");
  const raw = buildRfc822Email({ from, to, subject, body });
  const gmail = getGmailClient();
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: base64UrlEncode(raw) },
  });
}

export async function runPostPaymentSetup(input: {
  service: SupabaseClient;
  session: Stripe.Checkout.Session;
  dashboardBaseUrl: string;
  trigger: "webhook" | "success_page";
}) {
  const { service, session, dashboardBaseUrl, trigger } = input;
  const userId = clean(session.client_reference_id) || clean(session.metadata?.supabase_user_id);
  if (!userId) {
    return { ok: false as const, reason: "Kein User-Mapping in Session." };
  }

  const profileRes = await service
    .from("profiles")
    .select("id, company_id, tenant_id, mandant_id")
    .eq("id", userId)
    .maybeSingle();
  const prof = profileRes.data as
    | { id: string; company_id?: string | null; tenant_id?: string | null; mandant_id?: string | null }
    | null;

  let companyId = clean(prof?.company_id);
  let companyName = "Ihr Unternehmen";
  let tenantId = clean(prof?.mandant_id) || clean(prof?.tenant_id);

  if (!companyId) {
    const companyByUser = await service
      .from("companies")
      .select("id,name,tenant_id,mandant_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const c = companyByUser.data as
      | { id?: string | null; name?: string | null; tenant_id?: string | null; mandant_id?: string | null }
      | null;
    companyId = clean(c?.id);
    companyName = clean(c?.name) || companyName;
    tenantId = clean(c?.mandant_id) || clean(c?.tenant_id) || tenantId;
  }

  if (!companyId) {
    return { ok: false as const, reason: "Kein companies-Datensatz gefunden." };
  }

  if (!tenantId) tenantId = crypto.randomUUID();

  const updateCompany = async (withMandant: boolean) => {
    const patch: Record<string, unknown> = {
      is_subscribed: true,
      tenant_id: tenantId,
      account_status: "active",
      updated_at: new Date().toISOString(),
    };
    if (withMandant) patch.mandant_id = tenantId;
    return service.from("companies").update(patch).eq("id", companyId);
  };

  let upCompany = await updateCompany(true);
  if (upCompany.error?.message.includes("account_status")) {
    const retry = await service
      .from("companies")
      .update({
        is_subscribed: true,
        tenant_id: tenantId,
        mandant_id: tenantId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);
    upCompany = retry;
  }
  if (upCompany.error?.message.includes("mandant_id")) {
    const retry = await updateCompany(false);
    upCompany = retry;
  }
  if (upCompany.error) {
    throw new Error(`companies update fehlgeschlagen: ${upCompany.error.message}`);
  }

  let upProfile = await service
    .from("profiles")
    .upsert(
      {
        id: userId,
        company_id: companyId,
        tenant_id: tenantId,
        mandant_id: tenantId,
        role: "manager",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (upProfile.error?.message.includes("mandant_id")) {
    upProfile = await service
      .from("profiles")
      .upsert(
        {
          id: userId,
          company_id: companyId,
          tenant_id: tenantId,
          role: "manager",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
  }
  if (upProfile.error) {
    throw new Error(`profiles update fehlgeschlagen: ${upProfile.error.message}`);
  }

  const mandateId = await ensureFirstMandate({
    service,
    tenantId,
    userId,
    companyName,
  });

  const dashboardUrl = `${dashboardBaseUrl.replace(/\/$/, "")}/dashboard/konzern`;
  const customerEmail = clean(session.customer_email) || clean(session.customer_details?.email);
  try {
    await sendWelcomeEmail({
      to: customerEmail,
      dashboardUrl,
      companyName,
    });
  } catch (mailError) {
    await logEvent(
      "payment.welcome_email_error",
      "Willkommens-E-Mail konnte nicht gesendet werden.",
      {
        user_id: userId,
        customer_email: customerEmail || null,
        error: mailError instanceof Error ? mailError.message : "unknown",
      },
      { service, userId, companyId, tenantId },
    );
  }

  await logEvent(
    "payment.checkout_activated",
    "Checkout abgeschlossen: Konto aktiviert und Mandat bereitgestellt.",
    {
      trigger,
      stripe_session_id: session.id,
      mandate_id: mandateId,
    },
    { service, userId, companyId, tenantId },
  );

  return { ok: true as const, userId, companyId, tenantId, mandateId, dashboardUrl };
}

