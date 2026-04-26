import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/auditLog";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function normalizeDomain(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  // Accept "example.com" or "https://example.com/path"
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) {
      const u = new URL(s);
      if (!u.hostname) return null;
      return u.hostname.toLowerCase();
    }
  } catch {
    // ignore
  }
  // Basic domain-ish check
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

function safeObjectName(domain: string): string {
  // allow only a-z0-9.- in object key
  return domain.replace(/[^a-z0-9.-]/g, "-");
}

/** Kein HTML/Redirect-Seiten als „Logo“. */
async function tryFetchLogoBytes(
  url: string,
  defaultContentType: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "AxonCoreDemoBot/1.0" },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const ctRaw = (resp.headers.get("content-type") || "").toLowerCase();
    if (ctRaw.includes("text/html")) return null;
    const ab = await resp.arrayBuffer();
    const bytes = new Uint8Array(ab);
    if (bytes.length < 32) return null;
    const ct =
      resp.headers.get("content-type")?.trim() || defaultContentType;
    return { bytes, contentType: ct };
  } catch {
    return null;
  }
}

/**
 * Logo-Reihenfolge:
 * 1) Clearbit (wenn DNS/Netzwerk es erlaubt)
 * 2) Google s2 favicons (funktioniert oft, wenn Clearbit geblockt ist)
 * 3) https://{domain}/favicon.ico
 */
async function readLogoBytes(domain: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  const candidates: Array<{ url: string; defaultCt: string }> = [
    {
      url: `https://logo.clearbit.com/${encodeURIComponent(domain)}`,
      defaultCt: "image/png",
    },
    {
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      defaultCt: "image/png",
    },
    {
      url: `https://${domain}/favicon.ico`,
      defaultCt: "image/x-icon",
    },
  ];

  for (const { url, defaultCt } of candidates) {
    const r = await tryFetchLogoBytes(url, defaultCt);
    if (r) return r;
  }

  throw new Error(
    `Kein Logo für ${domain} ermittelbar (Clearbit / Google Favicon / favicon.ico).`,
  );
}

function demoCompanyName(domain: string) {
  return `DEMO:${domain}`;
}

function resolveDemoBaseUrl(overrideBaseUrl?: string | null): string {
  const override =
    typeof overrideBaseUrl === "string" ? overrideBaseUrl.trim().replace(/\/$/, "") : "";
  if (override) return override;
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  // Fallback exakt wie gewünscht
  return "https://deine-app.vercel.app";
}

export type GenerateAutomatedDemoResult = {
  domain: string;
  demoUrl: string;
  companyId: string;
  logoPublicUrl: string;
};

async function ensureDemoSeed(
  service: SupabaseClient,
  input: { companyId: string; domain: string },
): Promise<void> {
  const { companyId, domain } = input;

  const { data: existingMachine } = await service
    .from("machines")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  if (existingMachine) return;

  // 1) Standard-Standort
  const { data: loc, error: locErr } = await service
    .from("locations")
    .insert({
      company_id: companyId,
      name: "Hauptwerk",
      address: `Demo-Standort für ${domain}`,
    })
    .select("id")
    .maybeSingle();
  if (locErr) throw new Error(locErr.message ?? "locations Insert fehlgeschlagen.");

  const locationId = (loc as { id?: string } | null)?.id ?? null;

  // 2) Beispielmaschinen
  const serialBase = safeObjectName(domain).toUpperCase().replace(/\./g, "-").slice(0, 18);
  const demoMachines = [
    {
      name: "Spritzgussmaschine S7",
      serial_number: `DEMO-${serialBase}-S7`,
      status: "active",
    },
    {
      name: "Förderband Alpha",
      serial_number: `DEMO-${serialBase}-FB`,
      status: "maintenance",
    },
    {
      name: "Industrieroboter R1",
      serial_number: `DEMO-${serialBase}-R1`,
      status: "active",
    },
  ] as const;

  const { data: machines, error: mErr } = await service
    .from("machines")
    .insert(
      demoMachines.map((m) => ({
        company_id: companyId,
        serial_number: m.serial_number,
        name: m.name,
        status: m.status,
        location_id: locationId,
      })),
    )
    .select("id, name, serial_number, status");

  if (mErr) throw new Error(mErr.message ?? "machines Insert fehlgeschlagen.");

  const machineRows = (machines ?? []) as Array<{
    id: string;
    name: string | null;
    serial_number: string;
    status: string;
  }>;

  // 3) Dummy Fälle/Logs + Audit Logs
  const now = Date.now();
  const caseTemplates = [
    {
      action: "maintenance",
      detail: "Regelmäßige Wartung durchgeführt (Ölstand geprüft, Filter gereinigt).",
      analysis: "Wartung abgeschlossen. Keine kritischen Abweichungen festgestellt.",
      steps: ["Filter reinigen", "Schmierung prüfen", "Testlauf durchführen"],
      priority: "Niedrig",
    },
    {
      action: "inspection",
      detail: "Sicherheitscheck abgeschlossen. Keine Auffälligkeiten.",
      analysis: "Sicherheitsprüfung erfolgreich. Alle Sensoren im Normalbereich.",
      steps: ["Schutzeinrichtungen prüfen", "Not-Aus testen", "Sensorstatus dokumentieren"],
      priority: "Niedrig",
    },
    {
      action: "repair",
      detail: "Sensor neu kalibriert und Testlauf erfolgreich.",
      analysis: "Ursache war eine Drift in der Sensorkalibrierung. Nachjustierung stabil.",
      steps: ["Sensor kalibrieren", "Parameter speichern", "Testlauf validieren"],
      priority: "Mittel",
    },
  ] as const;

  for (const [idx, m] of machineRows.entries()) {
    const count = 2 + (idx % 2); // 2–3 Einträge
    for (let i = 0; i < count; i++) {
      const t = caseTemplates[(idx + i) % caseTemplates.length];
      const createdAt = new Date(now - (idx * 86400000 + i * 3600000)).toISOString();

      // ai_cases ist die robusteste Quelle für UI-Stats; best-effort mit Mandanten-Spalten.
      const baseCase: Record<string, unknown> = {
        user_id: companyId,
        analysis_text: t.analysis,
        solution_steps: t.steps,
        original_priority: t.priority,
        priority_override: {},
      };

      let caseInsert = await service
        .from("ai_cases")
        .insert({
          ...baseCase,
          company_id: companyId,
          tenant_id: companyId,
          machine_id: m.id,
        })
        .select("id")
        .maybeSingle();
      if (
        caseInsert.error?.message?.includes("column ai_cases.company_id does not exist") ||
        caseInsert.error?.message?.includes("column ai_cases.tenant_id does not exist") ||
        caseInsert.error?.message?.includes("column ai_cases.machine_id does not exist")
      ) {
        caseInsert = await service
          .from("ai_cases")
          .insert(baseCase)
          .select("id")
          .maybeSingle();
      }
      if (caseInsert.error) {
        throw new Error(caseInsert.error.message ?? "ai_cases Insert fehlgeschlagen.");
      }

      const aiCaseId = (caseInsert.data as { id?: string } | null)?.id ?? null;

      // machine_logs: in manchen DBs minimal (machine_id, ai_case_id, created_at).
      if (aiCaseId) {
        const ml = await service.from("machine_logs").insert({
          machine_id: m.id,
          ai_case_id: aiCaseId,
          created_at: createdAt,
        });
        if (ml.error) {
          throw new Error(ml.error.message ?? "machine_logs Insert fehlgeschlagen.");
        }
      }

      await logEvent(
        `demo_${t.action}`,
        `${m.name ?? "Maschine"}: ${t.detail}`,
        {
          machine_id: m.id,
          serial_number: m.serial_number,
          source: "automated_demo",
        },
        {
          service,
          userId: null,
          companyId,
          tenantId: companyId,
        },
      );
    }
  }
}

/**
 * generateAutomatedDemo(domain)
 *
 * - Logo laden: Clearbit → Google Favicons → favicon.ico
 * - Upload in Supabase Storage Bucket `branding` als `temp_[domain].png`
 * - Public URL generieren
 * - Temporäre companies-Zeile erstellen/aktualisieren
 * - Falls noch keine Maschinen existieren: Seed (Standort, Maschinen, Logs)
 * - Demo-Link zurückgeben: https://deine-app.vercel.app/demo?company=[domain]
 */
export async function generateAutomatedDemo(
  domainInput: string,
  opts?: { baseUrl?: string | null },
): Promise<GenerateAutomatedDemoResult> {
  const domain = normalizeDomain(domainInput);
  if (!domain) throw new Error("Ungültige Domain.");

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server ist nicht konfiguriert (Supabase).");
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { bytes, contentType } = await readLogoBytes(domain);

  const objectPath = `temp_${safeObjectName(domain)}.png`;
  const { error: upErr } = await service.storage
    .from("branding")
    .upload(objectPath, bytes, {
      upsert: true,
      contentType,
      cacheControl: "3600",
    });
  if (upErr) throw new Error(upErr.message ?? "Storage Upload fehlgeschlagen.");

  const { data: pub } = service.storage.from("branding").getPublicUrl(objectPath);
  const logoPublicUrl = pub.publicUrl;
  if (!logoPublicUrl) throw new Error("Konnte Public URL nicht erzeugen.");

  // Upsert demo company by "name" would be nice, but we don't know constraints.
  // So we: search by name, else insert a new demo row.
  const name = demoCompanyName(domain);
  const { data: existing } = await service
    .from("companies")
    .select("id, tenant_id")
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && (existing as { id?: string }).id) {
    const id = (existing as { id: string }).id;
    const { error: updErr } = await service
      .from("companies")
      .update({
        logo_url: logoPublicUrl,
        primary_color: "#000000",
        brand_name: name,
        tenant_id: id,
      })
      .eq("id", id);
    if (updErr) throw new Error(updErr.message ?? "companies Update fehlgeschlagen.");

    await ensureDemoSeed(service, { companyId: id, domain });

    const demoUrl = `${resolveDemoBaseUrl(opts?.baseUrl ?? null)}/dashboard/konzern?demo=${encodeURIComponent(domain)}`;
    return { domain, demoUrl, companyId: id, logoPublicUrl };
  }

  /**
   * Keine erfundene `user_id`: die referenziert `auth.users` und löst FK-Fehler aus.
   * Demo-Zeilen sind nur für Branding-Preview; Mandanten-Inhaber bleiben leer.
   */
  const { data: inserted, error: insErr } = await service
    .from("companies")
    .insert({
      name,
      brand_name: name,
      role: "user",
      is_subscribed: false,
      logo_url: logoPublicUrl,
      primary_color: "#000000",
    })
    .select("id, tenant_id")
    .maybeSingle();
  if (insErr) throw new Error(insErr.message ?? "companies Insert fehlgeschlagen.");
  const companyId = (inserted as { id?: string } | null)?.id;
  if (!companyId) throw new Error("companies Insert lieferte keine id.");
  // Ensure tenant_id matches company PK for demo scope consistency.
  await service.from("companies").update({ tenant_id: companyId }).eq("id", companyId);
  await ensureDemoSeed(service, { companyId, domain });

  const demoUrl = `${resolveDemoBaseUrl(opts?.baseUrl ?? null)}/dashboard/konzern?demo=${encodeURIComponent(domain)}`;
  return { domain, demoUrl, companyId, logoPublicUrl };
}

export async function loadDemoCompanyBrandingByDomain(
  service: SupabaseClient,
  domainInput: string,
): Promise<{ logo_url: string | null; primary_color: string | null }> {
  const domain = normalizeDomain(domainInput);
  if (!domain) return { logo_url: null, primary_color: null };
  const name = demoCompanyName(domain);
  const { data } = await service
    .from("companies")
    .select("logo_url, primary_color")
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  const r = data as { logo_url?: unknown; primary_color?: unknown } | null;
  return {
    logo_url: typeof r?.logo_url === "string" ? r.logo_url : null,
    primary_color: typeof r?.primary_color === "string" ? r.primary_color : null,
  };
}

