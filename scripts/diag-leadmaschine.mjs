/**
 * Diagnose-Skript fuer die Apollo-getriebene Leadmaschine.
 *
 * Verwendung:
 *   node --env-file=.env.production.local scripts/diag-leadmaschine.mjs
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\s/g, "") ?? "";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s/g, "") ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("FEHLER: Supabase-Credentials fehlen.");
  process.exit(1);
}

const APOLLO_KEY = process.env.APOLLO_API_KEY?.replace(/\s/g, "") ?? "";

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const sep = "─".repeat(78);
console.log(`\n${sep}\nLEADMASCHINE — DIAGNOSE (Apollo-Pivot)\n${sep}`);

// 1) Settings
const settings = await rest(
  "leadmaschine_settings?select=enabled,auto_send_enabled,leads_per_day_enterprise,leads_per_day_smb,min_seconds_between_gmail_sends,apollo_enabled,apollo_leads_per_day_enterprise,apollo_leads_per_day_smb,apollo_person_locations,apollo_org_employee_min,apollo_org_employee_max,updated_at&order=updated_at.desc&limit=1",
);
const s = settings[0] ?? {};
console.log("\n[Settings]");
console.log(`  enabled (Master Outreach):   ${s.enabled === true ? "✓ true" : "✗ false"}`);
console.log(`  auto_send_enabled:           ${s.auto_send_enabled === true ? "✓ true" : "✗ false"}`);
console.log(`  leads_per_day_enterprise:    ${s.leads_per_day_enterprise ?? "?"}`);
console.log(`  leads_per_day_smb:           ${s.leads_per_day_smb ?? "?"}`);
console.log(`  min_seconds_between_sends:   ${s.min_seconds_between_gmail_sends ?? "?"}`);
console.log(`  apollo_enabled:              ${s.apollo_enabled === true ? "✓ true" : "✗ false"}`);
console.log(`  apollo_per_day_ent:          ${s.apollo_leads_per_day_enterprise ?? "?"}`);
console.log(`  apollo_per_day_smb:          ${s.apollo_leads_per_day_smb ?? "?"}`);
console.log(`  apollo_locations:            ${(s.apollo_person_locations ?? []).join(", ") || "—"}`);
console.log(
  `  apollo_employee_range_ent:   ${s.apollo_org_employee_min ?? "?"}-${s.apollo_org_employee_max ?? "?"}`,
);
console.log(`  updated_at:                  ${s.updated_at ?? "?"}`);

// 2) APOLLO_API_KEY in ENV (lokal sichtbar?)
console.log("\n[ENV]");
console.log(`  APOLLO_API_KEY:              ${APOLLO_KEY ? "✓ gesetzt (" + APOLLO_KEY.length + " chars)" : "✗ FEHLT"}`);

// 3) Lead-Stage-Verteilung
const stages = ["new", "mail_1", "follow_up", "demo", "demo_sent", "replied", "disqualified"];
console.log("\n[Lead-Pipeline]");
for (const stg of stages) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?stage=eq.${stg}&select=id`,
    { headers: { ...headers, Prefer: "count=exact" } },
  );
  const count = r.headers.get("content-range")?.split("/")?.[1] ?? "?";
  console.log(`  stage=${stg.padEnd(13)} ${count}`);
}

// 4) Apollo-Lead-Quelle
const apolloLeadsRes = await fetch(
  `${SUPABASE_URL}/rest/v1/leads?apollo_person_id=not.is.null&select=id`,
  { headers: { ...headers, Prefer: "count=exact" } },
);
console.log(
  `  via Apollo:    ${apolloLeadsRes.headers.get("content-range")?.split("/")?.[1] ?? "?"}`,
);

// 5) Was ist faellig fuer naechsten Cron-Lauf?
const now = new Date().toISOString();
const dueRes = await rest(
  `leads?next_action_at=lte.${now}&stage=in.(new,mail_1,follow_up)&select=id,company_name,stage,next_action_at,manager_name,domain,contact_email,auto_send_blocked,lead_segment,apollo_person_id&limit=50`,
);
console.log(`\n[Faellig fuer naechsten Outreach-Cron] (${dueRes.length} Leads)`);
for (const l of dueRes.slice(0, 20)) {
  const flags = [
    l.auto_send_blocked ? "BLOCKED" : null,
    !l.manager_name ? "NO-MANAGER" : null,
    !l.domain ? "NO-DOMAIN" : null,
    !l.contact_email ? "NO-EMAIL" : null,
    l.apollo_person_id ? "Apollo" : null,
  ]
    .filter(Boolean)
    .join(",");
  console.log(
    `  [${l.stage.padEnd(11)}] ${l.company_name?.slice(0, 35).padEnd(36)} ${(l.contact_email ?? "(no email)").padEnd(40)} ${flags}`,
  );
}
if (dueRes.length > 20) console.log(`  ... +${dueRes.length - 20} weitere`);

// 6) Apollo-Discovery-Runs (letzte 10)
try {
  const runs = await rest(
    "apollo_discovery_runs?select=started_at,segment,trigger,target_count,inserted_count,enriched_count,apollo_credits_used,error_message&order=started_at.desc&limit=10",
  );
  console.log("\n[Letzte 10 Apollo-Discovery-Runs]");
  if (runs.length === 0) {
    console.log("  (keine Runs)");
  } else {
    for (const r of runs) {
      console.log(
        `  ${r.started_at}  ${r.segment.padEnd(11)} ${r.trigger.padEnd(7)} ` +
          `target=${String(r.target_count).padEnd(3)} ins=${String(r.inserted_count).padEnd(3)} ` +
          `enr=${String(r.enriched_count).padEnd(3)} credits=${String(r.apollo_credits_used).padEnd(3)} ` +
          `${r.error_message ? "ERR=" + r.error_message.slice(0, 40) : ""}`,
      );
    }
  }
} catch {
  console.log(
    "\n[Apollo-Discovery-Runs] (Tabelle fehlt — Migration 20260505180000 ausführen)",
  );
}

// 7) Letzte Cron-Aktivitaet (Outreach)
const eventsRes = await rest(
  `lead_outreach_events?select=created_at,event_type,status&order=created_at.desc&limit=10`,
);
console.log("\n[Letzte 10 Outreach-Events]");
for (const e of eventsRes) {
  console.log(`  ${e.created_at}  ${e.event_type.padEnd(20)} ${e.status}`);
}

// 8) Versandstatus
const prepRes = await fetch(
  `${SUPABASE_URL}/rest/v1/lead_outreach_events?status=eq.prepared&select=id`,
  { headers: { ...headers, Prefer: "count=exact" } },
);
const okRes = await fetch(
  `${SUPABASE_URL}/rest/v1/lead_outreach_events?status=eq.ok&channel=eq.email&select=id`,
  { headers: { ...headers, Prefer: "count=exact" } },
);
console.log("\n[Versandstatus]");
console.log(
  `  status=prepared (Draft, nicht gesendet):  ${prepRes.headers.get("content-range")?.split("/")?.[1] ?? "?"}`,
);
console.log(
  `  status=ok       (tatsaechlich versendet): ${okRes.headers.get("content-range")?.split("/")?.[1] ?? "?"}`,
);

// 9) Gmail-Token-Status
try {
  const tok = await rest(
    "gmail_oauth_tokens?select=user_email,expires_at,updated_at&limit=5",
  );
  console.log("\n[Gmail OAuth]");
  if (!Array.isArray(tok) || tok.length === 0) {
    console.log("  Kein OAuth-Token gefunden — Cron sendet KEINE Mails (bleibt Draft).");
  } else {
    for (const t of tok) {
      const exp = t.expires_at ? new Date(t.expires_at) : null;
      const expired = exp && exp.getTime() < Date.now();
      console.log(
        `  ${t.user_email}  expires=${t.expires_at} ${expired ? "✗ ABGELAUFEN" : "✓ ok"}`,
      );
    }
  }
} catch {
  console.log("\n[Gmail OAuth] (Tabelle nicht abrufbar — pruefe via Admin-UI)");
}

console.log(`\n${sep}\n`);
