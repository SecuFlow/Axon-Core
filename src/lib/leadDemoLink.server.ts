import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

export function getPublicSiteUrlFromEnv(): string | null {
  const base =
    sanitizeEnv(process.env.NEXT_PUBLIC_SITE_URL) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_APP_URL);
  if (!base) return null;
  try {
    return new URL(base).toString().replace(/\/+$/g, "");
  } catch {
    return null;
  }
}

export function getSmbBookingUrlFromEnv(): string | null {
  const raw =
    sanitizeEnv(process.env.AXON_SMB_BOOKING_URL) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_SMB_BOOKING_URL) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_BOOKING_URL);
  if (!raw) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

export function createServiceClientFromEnvSync(): SupabaseClient {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server nicht konfiguriert (Supabase Service Role).");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function generateDemoToken(): string {
  const bytes = Buffer.from(Array.from({ length: 18 }, () => Math.floor(Math.random() * 256)));
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function ensureLeadDemoLink(input: {
  service: SupabaseClient;
  leadId: string;
  actorId: string | null;
}): Promise<{ token: string; url: string | null }> {
  const { service, leadId, actorId } = input;

  const latest = await service
    .from("lead_demo_links")
    .select("token, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let token =
    typeof latest.data?.token === "string" && latest.data.token.trim()
      ? latest.data.token.trim()
      : "";

  if (!token) {
    token = generateDemoToken();
    const ins = await service.from("lead_demo_links").insert({
      lead_id: leadId,
      token,
      metadata: { actor: actorId, source: "ensure" },
    });
    if (ins.error) {
      // Token-Kollision ist extrem unwahrscheinlich; bei Fehler einfach weiterwerfen.
      throw new Error(ins.error.message);
    }
  }

  const base = getPublicSiteUrlFromEnv();
  const url = base ? `${base}/api/public/demo-link/${encodeURIComponent(token)}` : null;
  return { token, url };
}

export function getPublicSiteUrlFromRequest(req: Request): string | null {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");
  if (!host) return getPublicSiteUrlFromEnv();
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`.replace(/\/+$/g, "");
}

