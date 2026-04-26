import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getMetadataRole, isPrivateUserRole } from "@/lib/authUserMetadata";
import { isAppMetadataAdmin, normalizeDbRole } from "@/lib/adminAccess";

/**
 * SUPABASE_SERVICE_ROLE_KEY darf ausschließlich hier (Edge Middleware) via
 * process.env gelesen werden — niemals NEXT_PUBLIC_* und niemals in Client-Bundles.
 */

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

type CompanyRow = { roleNorm: string; is_subscribed: boolean };

/** Eine Zeile pro Auth-User: immer über companies.user_id (kein company_id aus Metadata). */
async function fetchCompanyByUserId(
  userId: string,
  db: SupabaseClient,
): Promise<CompanyRow | null> {
  const { data } = await db
    .from("companies")
    .select("role,is_subscribed")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    roleNorm: normalizeDbRole(data.role),
    is_subscribed: data.is_subscribed === true,
  };
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasDemo = request.nextUrl.searchParams.has("demo");

  const isDashboard =
    path === "/dashboard" || path.startsWith("/dashboard/");
  const isCoinSpace = path.startsWith("/coin-space");
  const isAdminHq = path.startsWith("/admin/hq");
  const isAdminHqLogin =
    path === "/admin/hq/login" || path.startsWith("/admin/hq/login/");

  const isWorkerLogin =
    path === "/worker/login" || path.startsWith("/worker/login/");
  /** Gesamter Worker-Bereich inkl. /worker und /worker/dashboard … */
  const isWorkerRoute =
    path === "/worker" || path.startsWith("/worker/");
  /** Schutz ohne Demo: alles außer reiner Login-Seite */
  const isWorkerProtected = isWorkerRoute && !isWorkerLogin;

  if (
    !isDashboard &&
    !isCoinSpace &&
    !isAdminHq &&
    !isWorkerRoute
  ) {
    return NextResponse.next();
  }

  // Gast-Demo-Modus: ohne Login, wenn `?demo=` gesetzt ist (Konzern + Worker).
  if ((isDashboard || isWorkerRoute) && hasDemo) {
    return NextResponse.next();
  }

  if (isAdminHqLogin) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const cleanedUrl = sanitizeEnv(supabaseUrl);
  const cleanedAnonKey = sanitizeEnv(supabaseAnonKey);

  if (!cleanedUrl || !cleanedAnonKey) {
    if (isDashboard || isCoinSpace) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(new URL("/admin/hq/login", request.url));
  }

  const accessToken = request.cookies.get("sb-access-token")?.value;

  if (!accessToken) {
    if (isAdminHq) {
      return NextResponse.redirect(new URL("/admin/hq/login", request.url));
    }
    if (isWorkerLogin) {
      return NextResponse.next();
    }
    if (isWorkerProtected) {
      return NextResponse.redirect(new URL("/worker/login", request.url));
    }
    if (isCoinSpace || isDashboard) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabaseUser = createClient(cleanedUrl, cleanedAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userData, error: userError } =
    await supabaseUser.auth.getUser();

  if (userError || !userData.user) {
    if (isAdminHq) {
      return NextResponse.redirect(new URL("/admin/hq/login", request.url));
    }
    if (isWorkerLogin) {
      return NextResponse.next();
    }
    if (isWorkerProtected) {
      return NextResponse.redirect(new URL("/worker/login", request.url));
    }
    if (isCoinSpace || isDashboard) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const userId = userData.user.id;
  const axonSessionId = request.cookies.get("axon-session-id")?.value ?? "";

  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const adminClient: SupabaseClient | null = serviceRoleKey
    ? createClient(cleanedUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const db = adminClient ?? supabaseUser;
  const company = await fetchCompanyByUserId(userId, db);
  const roleNorm = company?.roleNorm ?? "";

  const adminFromAppMeta = isAppMetadataAdmin(userData.user);
  const adminFromCompanyRow = roleNorm === "admin";

  const isAdmin = adminFromAppMeta || adminFromCompanyRow;
  const isPrivateUser = isPrivateUserRole(getMetadataRole(userData.user));

  // Single-Device Session Check (best-effort; falls Spalte nicht existiert, wird nicht blockiert).
  if (axonSessionId) {
    const profRes = await db
      .from("profiles")
      .select("active_session_id")
      .eq("id", userId)
      .maybeSingle();
    const colMissing =
      profRes.error?.message?.includes("active_session_id") === true;
    if (!colMissing && !profRes.error) {
      const active = (profRes.data as { active_session_id?: string | null } | null)
        ?.active_session_id;
      if (typeof active === "string" && active.length > 0 && active !== axonSessionId) {
        const redirectTo =
          isWorkerProtected ? "/worker/login" : isAdminHq ? "/admin/hq/login" : "/login";
        const res = NextResponse.redirect(new URL(redirectTo, request.url));
        res.cookies.set("sb-access-token", "", { path: "/", maxAge: 0 });
        res.cookies.set("sb-refresh-token", "", { path: "/", maxAge: 0 });
        res.cookies.set("axon-session-id", "", { path: "/", maxAge: 0 });
        return res;
      }
    }
  }

  if (isWorkerRoute && !isWorkerLogin) {
    return NextResponse.next();
  }

  if (isCoinSpace) {
    if (isPrivateUser) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ——— Gesamtes Konzern-Dashboard (/dashboard/*): Privat → Coin-Space ———
  if (isDashboard) {
    if (isPrivateUser) {
      return NextResponse.redirect(new URL("/coin-space", request.url));
    }
  }

  // Admin: /admin/hq und /dashboard ohne Abo-Check
  if (isAdmin) {
    return NextResponse.next();
  }

  // ——— /admin/hq: nur Admins ———
  if (isAdminHq) {
    return NextResponse.redirect(new URL("/admin/hq/login", request.url));
  }

  // ——— /dashboard/*: Konzern user-Rolle prüft Abo ———

  const bypassRaw = process.env.AXON_BYPASS_SUBSCRIPTION?.trim().toLowerCase();
  if (bypassRaw === "true" || bypassRaw === "1") {
    return NextResponse.next();
  }

  if (roleNorm === "user" || roleNorm === "manager") {
    if (company?.is_subscribed === true) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/checkout", request.url));
  }

  return NextResponse.redirect(new URL("/checkout", request.url));
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/coin-space",
    "/coin-space/:path*",
    "/admin/hq",
    "/admin/hq/:path*",
    "/worker",
    "/worker/:path*",
  ],
};
