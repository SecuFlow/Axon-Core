/**
 * Einmaliges Test-Skript: legt einen Lead + lead_demo_links-Token an,
 * damit Du den Mail-#3-Demo-Link-Flow live klicken kannst, OHNE eine
 * echte Mail zu versenden.
 *
 * Verwendung:
 *   node --env-file=.env.production.local scripts/create-test-demo-link.mjs
 *
 * Optionale Flags:
 *   --domain=<domain>        (Default: tesla.com)
 *   --company=<name>         (Default: "Tesla Test (interner Klick)")
 *   --base-url=<url>         (Default: erste production-URL aus VERCEL_URL/SITE_URL,
 *                             sonst der Vercel-Deployment-Host)
 *   --cleanup-token=<token>  Loescht den Lead anhand des Tokens und beendet.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\s/g, "") ?? "";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s/g, "") ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "FEHLER: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.\n" +
      "Tipp: vercel env pull .env.production.local --environment production --yes",
  );
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.join("=")];
  }),
);

const domain = (args.domain ?? "tesla.com").toLowerCase().trim();
const companyName = args.company ?? `Tesla Test (interner Klick)`;
const baseUrl =
  (args["base-url"] ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://axon-core-programm-secuflows-projects.vercel.app")
    .trim()
    .replace(/\/+$/g, "");

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rest(method, path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${method} ${path} -> ${r.status}\n${t}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

function generateToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function cleanup(token) {
  const links = await rest(
    "GET",
    `lead_demo_links?token=eq.${encodeURIComponent(token)}&select=lead_id`,
  );
  if (!Array.isArray(links) || links.length === 0) {
    console.log(`Kein Lead-Demo-Link mit token=${token} gefunden.`);
    return;
  }
  const leadId = links[0].lead_id;
  await rest("DELETE", `lead_demo_links?token=eq.${encodeURIComponent(token)}`);
  await rest("DELETE", `leads?id=eq.${encodeURIComponent(leadId)}`);
  console.log(`Lead ${leadId} und Token ${token} geloescht.`);
}

async function main() {
  if (args["cleanup-token"]) {
    await cleanup(args["cleanup-token"]);
    return;
  }

  const dedupeKey = `test-demo-link-${domain}-${Date.now()}`;
  const insertedLeads = await rest("POST", "leads", {
    dedupe_key: dedupeKey,
    company_name: companyName,
    domain,
    market_segment: "enterprise",
    stage: "demo",
    notes: "Test-Lead fuer Demo-Link-Klick-Test (kann gefahrlos geloescht werden).",
  });
  const lead = Array.isArray(insertedLeads) ? insertedLeads[0] : insertedLeads;
  if (!lead?.id) throw new Error("leads insert lieferte keine ID.");

  const token = generateToken();
  await rest("POST", "lead_demo_links", {
    lead_id: lead.id,
    token,
    metadata: { source: "test-script", actor: null },
  });

  const tokenBase = `${baseUrl}/api/public/demo-link/${encodeURIComponent(token)}`;
  const linkKonzern = `${tokenBase}?app=konzern`;
  const linkWorker = `${tokenBase}?app=worker`;

  console.log("\n=== TEST-LEAD + DEMO-LINKS ANGELEGT ===\n");
  console.log(`Lead-ID:     ${lead.id}`);
  console.log(`Domain:      ${domain}`);
  console.log(`Company:     ${companyName}`);
  console.log(`Stage:       demo`);
  console.log(`Token:       ${token}`);
  console.log(`\n>>> KLICK-LINK 1: KONZERN-DASHBOARD (Manager-Sicht) <<<\n`);
  console.log(`  ${linkKonzern}\n`);
  console.log(`>>> KLICK-LINK 2: MITARBEITER-APP (Werker-Sicht an der Maschine) <<<\n`);
  console.log(`  ${linkWorker}\n`);
  console.log(
    "Beim ersten Klick (egal welcher) sollte folgendes passieren:",
  );
  console.log("  1. Stage springt auf 'demo_sent'");
  console.log("  2. lead_outreach_events bekommt einen 'demo_requested'-Eintrag (mit app-Tag)");
  console.log("  3. audit_logs bekommt 'lead.demo_link_opened' (mit app-Tag)");
  console.log(`  4. Da DEMO:${domain} noch nicht existiert, wird sie on-the-fly`);
  console.log(`     angelegt (Logo-Fetch ueber Clearbit, ~1-3s)`);
  console.log(`  5a. Konzern-Link -> /dashboard/konzern?demo=${domain}`);
  console.log(`      (Logo, 3 Maschinen, 7 AI-Cases, KPIs)`);
  console.log(`  5b. Worker-Link  -> /worker/dashboard?demo=${domain}`);
  console.log(`      (Mitarbeiter-Sicht: Wissens-Eingabe an der Maschine)\n`);
  console.log(
    `Cleanup nach Test:\n` +
      `  node --env-file=.env.production.local scripts/create-test-demo-link.mjs --cleanup-token=${token}\n`,
  );
}

main().catch((err) => {
  console.error("FEHLER:", err.message ?? err);
  process.exit(1);
});
