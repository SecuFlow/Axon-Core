/**
 * Lokale Demo-Daten für eine Firma mit demo_slug `axon-core-hq` oder `siemens`.
 *
 * Ausführen (Node 20+, lädt .env.local):
 *   node --env-file=.env.local scripts/seed-local-demo.mjs
 *
 * Benötigt: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: AXON_SEED_DEMO_SLUG=axon-core-hq|siemens (überschreibt die Slug-Reihenfolge)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIMARY = "#009999";
const BUCKET = "branding";
const META = { source: "local_seed" };

const SLUG_PRIORITY = (process.env.AXON_SEED_DEMO_SLUG ?? "")
  .trim()
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const DEFAULT_SLUG_ORDER = ["axon-core-hq", "siemens"];

const MACHINE_ROWS = [
  { serial_number: "SEED-DEMO-001", name: "Spritzguss-Anlage A1", status: "active" },
  { serial_number: "SEED-DEMO-002", name: "Roboterarm Kuka KR IONTEC", status: "active" },
  { serial_number: "SEED-DEMO-003", name: "CNC-Bearbeitungszentrum Heller MCD", status: "maintenance" },
  { serial_number: "SEED-DEMO-004", name: "Transportband Linie 7", status: "offline" },
  { serial_number: "SEED-DEMO-005", name: "Qualitäts-Scanner Vision Q3", status: "active" },
];

const AUDIT_ROWS = [
  { action: "compliance.security", description: "Sicherheitscheck bestanden (ISO 27001)" },
  { action: "maintenance.due", description: "Wartung fällig — Termin in 14 Tagen" },
  { action: "audit.access", description: "Zugriff Protokoll: Werkstatt-Tablet authentifiziert" },
  { action: "maintenance.completed", description: "Präventivwartung Abschnitt Hydraulik abgeschlossen" },
  { action: "alert.resolved", description: "Temperaturwarnung Kühlkreislauf behoben" },
  { action: "inventory.sync", description: "Maschinen-Stammdaten mit ERP synchronisiert" },
  { action: "compliance.training", description: "Schulungsnachweis Bediener aktualisiert" },
  { action: "backup.ok", description: "Tägliches Log-Backup erfolgreich" },
  { action: "license.check", description: "Software-Lizenzen Robotersteuerung gültig bis Q4" },
  { action: "safety.lockout", description: "Lockout/Tagout-Verfahren dokumentiert" },
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v?.trim()) {
    console.error(`Fehlende Umgebungsvariable: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const slugOrder =
    SLUG_PRIORITY.length > 0 ? SLUG_PRIORITY : DEFAULT_SLUG_ORDER;

  let company = null;
  let usedSlug = null;

  for (const slug of slugOrder) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, tenant_id, demo_slug, brand_name")
      .eq("demo_slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      company = data;
      usedSlug = slug;
      break;
    }
  }

  if (!company) {
    const slug = slugOrder[0] ?? "axon-core-hq";
    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: "AXON Core HQ (lokal)",
        brand_name: "AXON Core HQ",
        demo_slug: slug,
        is_demo_active: true,
        show_cta: true,
        primary_color: PRIMARY,
      })
      .select("id, tenant_id, demo_slug, brand_name")
      .single();
    if (error) throw error;
    company = data;
    usedSlug = slug;
    console.log(`Neue Firma angelegt: demo_slug=${usedSlug}`);
  } else {
    console.log(`Firma gefunden: demo_slug=${usedSlug} id=${company.id}`);
  }

  const logoPath = `demo/${company.id}/seed-logo.svg`;
  let logoBody;
  try {
    logoBody = readFileSync(join(ROOT, "public", "default-logo.svg"));
  } catch {
    console.warn("public/default-logo.svg nicht lesbar — überspringe Upload.");
    logoBody = null;
  }

  let logoUrl = null;
  if (logoBody) {
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(logoPath, logoBody, {
        contentType: "image/svg+xml",
        upsert: true,
      });
    if (upErr) {
      console.warn("Storage-Upload:", upErr.message);
    } else {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(logoPath);
      logoUrl = pub?.publicUrl ?? null;
      console.log(`Logo im Bucket: ${logoUrl}`);
    }
  }

  const { error: brandErr } = await supabase
    .from("companies")
    .update({
      primary_color: PRIMARY,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
      brand_name: company.brand_name ?? "Demo Mandant",
    })
    .eq("id", company.id);
  if (brandErr) throw brandErr;
  console.log(`Branding: primary_color=${PRIMARY}${logoUrl ? ` logo_url gesetzt` : ""}`);

  const serials = MACHINE_ROWS.map((m) => m.serial_number);
  const { error: delM } = await supabase
    .from("machines")
    .delete()
    .eq("company_id", company.id)
    .in("serial_number", serials);
  if (delM) throw delM;

  const machineIns = MACHINE_ROWS.map((m) => ({
    company_id: company.id,
    serial_number: m.serial_number,
    name: m.name,
    status: m.status,
  }));

  const { error: insM } = await supabase.from("machines").insert(machineIns);
  if (insM) throw insM;
  console.log(`${MACHINE_ROWS.length} Maschinen eingefügt.`);

  const { error: delA } = await supabase
    .from("audit_logs")
    .delete()
    .eq("company_id", company.id)
    .contains("metadata", { source: "local_seed" });
  if (delA) throw delA;

  const auditIns = AUDIT_ROWS.map((row, i) => ({
    company_id: company.id,
    tenant_id: company.tenant_id,
    action: row.action,
    description: row.description,
    metadata: {
      ...META,
      index: i + 1,
    },
  }));

  const { error: insA } = await supabase.from("audit_logs").insert(auditIns);
  if (insA) throw insA;
  console.log(`${AUDIT_ROWS.length} Audit-Logs eingefügt.`);

  console.log("Fertig.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
