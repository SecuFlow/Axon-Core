/**
 * Verifiziert nach einem Klick auf den Test-Demo-Link, dass alle erwarteten
 * Datenbank-Effekte eingetreten sind.
 *
 * Verwendung:
 *   node --env-file=.env.production.local scripts/check-test-demo-link.mjs <token>
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\s/g, "") ?? "";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s/g, "") ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("FEHLER: Supabase-Credentials fehlen.");
  process.exit(1);
}

const token = process.argv[2];
if (!token) {
  console.error("Usage: node scripts/check-test-demo-link.mjs <token>");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!r.ok) {
    throw new Error(`${path}: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

function check(label, ok, detail = "") {
  console.log(`${ok ? "[OK]" : "[--]"} ${label}${detail ? "  " + detail : ""}`);
}

async function main() {
  console.log(`\nPrueft Token: ${token}\n`);

  const links = await rest(
    `lead_demo_links?token=eq.${encodeURIComponent(token)}&select=lead_id,opened_at,created_at`,
  );
  if (!Array.isArray(links) || links.length === 0) {
    console.log("[--] Token nicht gefunden in lead_demo_links.");
    process.exit(1);
  }
  const link = links[0];
  check("Token in lead_demo_links", true, `lead=${link.lead_id}`);
  check("opened_at gesetzt", !!link.opened_at, link.opened_at ?? "noch leer");

  const leads = await rest(
    `leads?id=eq.${encodeURIComponent(link.lead_id)}&select=stage,domain,company_name,next_action_at,updated_at`,
  );
  const lead = leads[0];
  check("lead.stage = demo_sent", lead?.stage === "demo_sent", `actual=${lead?.stage}`);
  check("lead.next_action_at = null", lead?.next_action_at === null);

  const events = await rest(
    `lead_outreach_events?lead_id=eq.${encodeURIComponent(link.lead_id)}&select=event_type,channel,created_at&order=created_at.desc&limit=5`,
  );
  const hasDemoRequested = (events ?? []).some(
    (e) => e.event_type === "demo_requested",
  );
  check(
    "lead_outreach_events: demo_requested vorhanden",
    hasDemoRequested,
    `events=${(events ?? []).map((e) => e.event_type).join(",")}`,
  );

  const audits = await rest(
    `audit_logs?action=eq.lead.demo_link_opened&select=created_at,metadata&order=created_at.desc&limit=5`,
  );
  const hasAudit = (audits ?? []).some(
    (a) => a.metadata?.lead_id === link.lead_id || a.metadata?.token === token,
  );
  check(
    "audit_logs: lead.demo_link_opened vorhanden",
    hasAudit,
    `letzte ${(audits ?? []).length} Eintraege geprueft`,
  );

  const domain = lead?.domain;
  if (domain) {
    const companies = await rest(
      `companies?name=eq.${encodeURIComponent(`DEMO:${domain}`)}&select=id,logo_url,demo_slug,is_demo_active`,
    );
    const c = companies?.[0];
    check(
      `companies: DEMO:${domain} angelegt`,
      !!c?.id,
      c?.id ? `id=${c.id}` : "noch nicht da",
    );
    if (c?.id) {
      check("logo_url gesetzt", !!c.logo_url, c.logo_url ? "" : "fehlt");

      const ms = await rest(
        `machines?company_id=eq.${encodeURIComponent(c.id)}&select=id`,
      );
      check(
        "Maschinen geseedet",
        Array.isArray(ms) && ms.length >= 3,
        `count=${ms?.length ?? 0}`,
      );

      const cases = await rest(
        `ai_cases?machine_id=in.(${(ms ?? []).map((m) => `"${m.id}"`).join(",") || '""'})&select=id`,
      );
      check(
        "AI-Cases geseedet",
        Array.isArray(cases) && cases.length >= 6,
        `count=${cases?.length ?? 0}`,
      );
    }
  }

  console.log("");
}

main().catch((err) => {
  console.error("FEHLER:", err.message ?? err);
  process.exit(1);
});
