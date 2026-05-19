import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getGmailClient, getGmailUserEmail } from "@/lib/gmailClient.server";
import { appendBrandSignaturePlain, buildMultipartAlternativeRfc822 } from "@/lib/emailBrandFooter.server";
import { logEvent } from "@/lib/auditLog";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Liest aus der Demo-Firma (`DEMO:<slug>` oder über `demo_slug`-Spalte) das
 * gepflegte Branding (Logo + Primärfarbe) und überträgt es in den
 * `branding`-Eintrag des neu angelegten Mandanten. Ziel: Wenn ein Lead die
 * Demo gesehen hat und kauft, soll der frisch angelegte Account direkt mit
 * dem gewohnten Logo/Farbschema starten — kein zweites Branding-Onboarding.
 *
 * Best-effort: Fehlen Spalten/Tabellen, bleibt der Aufruf still ohne den
 * Stripe-Flow zu blockieren.
 */
async function copyDemoBrandingIntoTenant(input: {
  service: SupabaseClient;
  demoSlug: string;
  tenantId: string;
  companyId: string | null;
  actingUserId: string;
}): Promise<void> {
  const slug = clean(input.demoSlug);
  if (!slug) return;

  type DemoBrandingRow = {
    brand_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
  };

  try {
    // 1) Demo-Firma per `demo_slug`-Spalte (neuere Schemata) oder per Namens-
    //    Konvention `DEMO:<slug>` finden.
    let demoRow: DemoBrandingRow | null = null;

    const bySlug = await input.service
      .from("companies")
      .select("brand_name, logo_url, primary_color")
      .eq("demo_slug", slug)
      .limit(1)
      .maybeSingle();
    if (!bySlug.error && bySlug.data) {
      demoRow = bySlug.data as unknown as DemoBrandingRow;
    } else {
      const byName = await input.service
        .from("companies")
        .select("brand_name, logo_url, primary_color")
        .eq("name", `DEMO:${slug}`)
        .limit(1)
        .maybeSingle();
      if (!byName.error && byName.data) {
        demoRow = byName.data as unknown as DemoBrandingRow;
      }
    }

    if (!demoRow) return;

    const logoUrl =
      typeof demoRow.logo_url === "string" && demoRow.logo_url.trim()
        ? demoRow.logo_url.trim()
        : null;
    const primary =
      typeof demoRow.primary_color === "string" && demoRow.primary_color.trim()
        ? demoRow.primary_color.trim()
        : null;
    const brandName =
      typeof demoRow.brand_name === "string" && demoRow.brand_name.trim()
        ? demoRow.brand_name.trim()
        : null;

    if (!logoUrl && !primary && !brandName) return;

    // 2) Branding-Tabelle (Mandanten-scoped) befüllen — überschreibt nichts,
    //    wenn der Kunde schon ein eigenes Branding gepflegt hat (wir setzen
    //    nur, wenn beim Upsert nichts existiert).
    const existing = await input.service
      .from("branding")
      .select("logo_url, primary_color, brand_name")
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    const existingRow = (existing.data as {
      logo_url?: string | null;
      primary_color?: string | null;
      brand_name?: string | null;
    } | null) ?? null;

    const patch: Record<string, unknown> = {
      tenant_id: input.tenantId,
      company_id: input.companyId,
      updated_by: input.actingUserId,
    };
    if (logoUrl && !existingRow?.logo_url) patch.logo_url = logoUrl;
    if (primary && !existingRow?.primary_color) patch.primary_color = primary;
    if (brandName && !existingRow?.brand_name) patch.brand_name = brandName;

    // Nur upserten, wenn wir tatsächlich etwas Neues übernehmen würden.
    if (
      patch.logo_url !== undefined ||
      patch.primary_color !== undefined ||
      patch.brand_name !== undefined
    ) {
      await input.service
        .from("branding")
        .upsert(patch, { onConflict: "tenant_id" });
    }

    // 3) Companies-Tabelle spiegeln (Legacy-Pfad), wenn die jeweilige Spalte
    //    noch leer ist — damit ältere Lese-Pfade ebenfalls greifen.
    if (input.companyId) {
      const companyExisting = await input.service
        .from("companies")
        .select("logo_url, primary_color, brand_name")
        .eq("id", input.companyId)
        .maybeSingle();
      const ce = (companyExisting.data as {
        logo_url?: string | null;
        primary_color?: string | null;
        brand_name?: string | null;
      } | null) ?? null;

      const companyPatch: Record<string, unknown> = {};
      if (logoUrl && !ce?.logo_url) companyPatch.logo_url = logoUrl;
      if (primary && !ce?.primary_color) companyPatch.primary_color = primary;
      if (brandName && !ce?.brand_name) companyPatch.brand_name = brandName;
      if (Object.keys(companyPatch).length > 0) {
        await input.service
          .from("companies")
          .update(companyPatch)
          .eq("id", input.companyId);
      }
    }
  } catch {
    // Best-effort: Demo-Branding-Übernahme darf den Stripe-Flow niemals brechen.
  }
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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
  const bodyText = appendBrandSignaturePlain(
    [
      `Hallo ${input.companyName || "Team"},`,
      "",
      "Ihre Zahlung war erfolgreich. Ihr Konzern-Dashboard wird gerade eingerichtet.",
      "",
      `Direktlink: ${input.dashboardUrl}`,
      "",
      "Wenn die Seite noch vorbereitet wird, bitte kurz warten und neu laden.",
      "",
      "Viele Grüße",
    ].join("\n"),
  );
  const raw = buildMultipartAlternativeRfc822({
    from,
    to,
    subject,
    textBody: bodyText,
  });
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

  // Demo → Account: Branding (Logo, Primärfarbe, Brand-Name) aus der
  // Demo-Firma in den frisch aktivierten Mandanten übernehmen, falls der Lead
  // aus einem Demo-Link kam (`metadata.demo_slug` oder `metadata.demo`).
  const demoSlugFromSession =
    clean((session.metadata as Record<string, string | undefined> | null)?.demo_slug) ||
    clean((session.metadata as Record<string, string | undefined> | null)?.demo);
  if (demoSlugFromSession) {
    await copyDemoBrandingIntoTenant({
      service,
      demoSlug: demoSlugFromSession,
      tenantId,
      companyId,
      actingUserId: userId,
    });
  }

  // Best-effort: Stripe IDs + Subscription Status persistieren (falls Spalten existieren).
  try {
    const subId = clean(session.subscription);
    const custId = clean(session.customer);
    const patch: Record<string, unknown> = {
      ...(custId ? { stripe_customer_id: custId } : {}),
      ...(subId ? { stripe_subscription_id: subId } : {}),
      subscription_status: "active",
      updated_at: new Date().toISOString(),
    };
    if (Object.keys(patch).length > 0) {
      const upd = await service.from("companies").update(patch).eq("id", companyId);
      if (upd.error?.message?.toLowerCase().includes("stripe_") || upd.error?.message?.toLowerCase().includes("subscription_")) {
        // Legacy schema ohne Spalten: ignorieren.
      }
    }
  } catch {
    // ignore
  }

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

