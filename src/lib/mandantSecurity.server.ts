import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveActorMandantId } from "@/lib/mandantScope";
import { logEvent } from "@/lib/auditLog";

const sanitizeEnv = (value: string | undefined) =>
  value ? value.replace(/\s/g, "") : undefined;

export type MandantAuthContext =
  | {
      ok: true;
      service: SupabaseClient;
      userId: string;
      actorMandantId: string;
      isAdmin: boolean;
    }
  | { ok: false; response: NextResponse };

/**
 * Server-side Auth + Mandant-Context aus HttpOnly Cookie JWT.
 * Liefert Service-Role Client (für Audit/DB), plus `actorMandantId`.
 */
export async function requireMandantAuthContext(
  opts?: { allowAdmin?: boolean },
): Promise<MandantAuthContext> {
  const allowAdmin = opts?.allowAdmin !== false;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value ?? "";

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!accessToken || !supabaseUrl || !anonKey || !serviceKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }),
    };
  }

  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userScoped.auth.getUser();
  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sitzung ungültig." }, { status: 401 }),
    };
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Admins dürfen mandantenübergreifend — aber wir loggen trotzdem, wenn sie mismatchen (opt-in später).
  const userMetaRole = (data.user.user_metadata as { role?: unknown } | null)?.role;
  const isAdmin =
    allowAdmin &&
    (data.user.app_metadata?.role === "admin" ||
      String(userMetaRole ?? "")
        .toLowerCase()
        .trim() === "admin");

  const actorMandantId = await resolveActorMandantId(service, data.user.id);
  if (!actorMandantId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Keine Mandanten-Zuordnung." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    service,
    userId: data.user.id,
    actorMandantId,
    isAdmin,
  };
}

/**
 * Harte Prüfung: Actor-Mandant muss zum Datensatz-Mandant passen.
 * Bei Mismatch: 403 und Audit-Log (Admin → Sicherheit).
 */
export async function forbidIfMandantMismatch(input: {
  ctx: Extract<MandantAuthContext, { ok: true }>;
  recordMandantId: string | null;
  resource: string;
  resourceId?: string | null;
  request?: Request;
}): Promise<NextResponse | null> {
  const { ctx, recordMandantId, resource, resourceId, request } = input;
  const rec = (recordMandantId ?? "").trim();
  if (!rec) return null;
  if (ctx.isAdmin) return null;

  if (rec !== ctx.actorMandantId) {
    await logEvent(
      "security.mandant_mismatch",
      `Mandanten-Mismatch: Zugriff auf ${resource} verweigert.`,
      {
        actor_mandant_id: ctx.actorMandantId,
        record_mandant_id: rec,
        resource,
        resource_id: resourceId ?? null,
        path: request ? new URL(request.url).pathname : null,
      },
      { service: ctx.service, userId: ctx.userId, tenantId: ctx.actorMandantId },
    );
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

