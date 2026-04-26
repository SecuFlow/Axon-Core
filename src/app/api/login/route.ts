import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getMetadataRole, isPrivateUserRole } from "@/lib/authUserMetadata";
import { isAppMetadataAdmin, normalizeDbRole } from "@/lib/adminAccess";
import { ensureUserProfileOnLogin } from "@/lib/ensureUserProfile";
import { ensureEnterpriseMigrationAuditOnLogin } from "@/lib/enterpriseMigrationAudit";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

type LoginFlow = "konzern" | "admin";

type CompanyAuthRow = { role: string; is_subscribed: boolean };
type ProfileAuthRow = { role: string; must_change_password: boolean };

function isWorkerRole(raw: string): boolean {
  const r = normalizeDbRole(raw);
  return r === "worker" || r === "user" || r === "mitarbeiter" || r === "employee";
}

/**
 * Zeile aus public.companies per user_id (Konzern-Nutzer).
 * Bevorzugt Service-Role (RLS), sonst User-JWT-Client.
 */
async function fetchCompanyByUserId(
  supabaseUrl: string,
  userId: string,
  userScoped: SupabaseClient,
  serviceRoleKey: string | undefined,
): Promise<CompanyAuthRow | null> {
  const db: SupabaseClient =
    serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : userScoped;

  const { data } = await db
    .from("companies")
    .select("role,is_subscribed")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const roleNorm = normalizeDbRole(data.role);
  if (!roleNorm) return null;

  return {
    role: roleNorm,
    is_subscribed: data.is_subscribed === true,
  };
}

async function fetchProfileByUserId(
  userScoped: SupabaseClient,
  userId: string,
): Promise<ProfileAuthRow | null> {
  const { data } = await userScoped
    .from("profiles")
    .select("role,must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    role: normalizeDbRole((data as { role?: unknown }).role),
    must_change_password:
      (data as { must_change_password?: unknown }).must_change_password === true,
  };
}

/** Konzern-Login: Rolle user oder manager + Abo, nie Admin-HQ. */
function resolveKonzernLoginRedirect(row: CompanyAuthRow | null): string {
  if (!row) {
    return "/checkout";
  }
  if (row.role !== "user" && row.role !== "manager") {
    return "/checkout";
  }
  return row.is_subscribed ? "/dashboard" : "/checkout";
}

async function isAdminAccount(
  user: { id: string; app_metadata?: Record<string, unknown> | null },
  supabaseUrl: string,
  userId: string,
  serviceRoleKey: string | undefined,
  userScoped: SupabaseClient,
): Promise<boolean> {
  if (isAppMetadataAdmin(user)) return true;

  const byUserId = await fetchCompanyByUserId(
    supabaseUrl,
    userId,
    userScoped,
    serviceRoleKey,
  );
  if (byUserId?.role === "admin") return true;

  return false;
}

export async function POST(req: Request) {
  let payload: {
    email?: string;
    password?: string;
    flow?: string;
    accountType?: string;
  } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültige Request-Body" },
      { status: 400 },
    );
  }

  const email = payload.email ?? "";
  const password = payload.password ?? "";
  const flow: LoginFlow = payload.flow === "admin" ? "admin" : "konzern";

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      {
        error:
          "Supabase ist nicht konfiguriert (fehlende NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY).",
      },
      { status: 500 },
    );
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Email/Passwort fehlen" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (loginError || !data.session) {
    return NextResponse.json(
      { error: loginError?.message ?? "Login fehlgeschlagen" },
      { status: 401 },
    );
  }

  const session = data.session;
  const maxAge = session.expires_in ?? 60 * 60;

  const userScoped = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const userId = session.user.id;

  let redirect: string;

  if (flow === "admin") {
    const allowed = await isAdminAccount(
      session.user,
      supabaseUrl,
      userId,
      serviceRoleKey,
      userScoped,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Kein Zugriff auf Admin-HQ." },
        { status: 403 },
      );
    }
    redirect = "/admin/hq";
  } else {
    const metaRole = getMetadataRole(session.user);
    if (isPrivateUserRole(metaRole)) {
      redirect = "/coin-space";
    } else {
      const profileRow = await fetchProfileByUserId(userScoped, userId);
      if (profileRow && isWorkerRole(profileRow.role)) {
        redirect = profileRow.must_change_password
          ? "/worker/passwort-aendern"
          : "/worker/dashboard";
      } else {
        const adminForKonzern = await isAdminAccount(
          session.user,
          supabaseUrl,
          userId,
          serviceRoleKey,
          userScoped,
        );
        if (adminForKonzern) {
          redirect = "/dashboard";
        } else {
          const companyRow = await fetchCompanyByUserId(
            supabaseUrl,
            userId,
            userScoped,
            serviceRoleKey,
          );
          redirect = resolveKonzernLoginRedirect(companyRow);
        }
      }
    }
  }

  const res = NextResponse.json({ ok: true, redirect });

  if (serviceRoleKey) {
    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try {
      await ensureUserProfileOnLogin(svc, userId);
    } catch {
      // Profil-Anlage ist best-effort; Login bleibt gültig.
    }
    try {
      await ensureEnterpriseMigrationAuditOnLogin(svc, userId);
    } catch {
      // Audit ist best-effort; Login bleibt gültig.
    }

    // Single-Device Session: neueste Session gewinnt (älteres Login wird via Middleware getrennt).
    try {
      const sessionId = crypto.randomUUID();
      // Best-effort: Spalte existiert ggf. noch nicht (Migration).
      const up = await svc
        .from("profiles")
        .update({
          active_session_id: sessionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (!up.error) {
        res.cookies.set("axon-session-id", sessionId, {
          path: "/",
          maxAge,
          sameSite: "lax",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
        });
      }
    } catch {
      // session binding is best-effort
    }
  }

  res.cookies.set("sb-access-token", session.access_token, {
    path: "/",
    maxAge,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  res.cookies.set("sb-refresh-token", session.refresh_token, {
    path: "/",
    maxAge,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}
