import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/auditLog";

export const runtime = "nodejs";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

async function requireUserIdFromCookie(request: NextRequest): Promise<string> {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const accessToken = request.cookies.get("sb-access-token")?.value;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }
  if (!accessToken) {
    throw new Error("Nicht eingeloggt.");
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Session ist nicht gueltig.");
  }
  return userData.user.id;
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY fehlt." },
        { status: 500 },
      );
    }

    const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!supabaseUrl) {
      return NextResponse.json(
        { error: "Supabase ist nicht konfiguriert." },
        { status: 500 },
      );
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Ungültige Request-Body." },
        { status: 400 },
      );
    }

    const { case_id, original_priority, priority_override } = payload as {
      case_id?: string;
      original_priority?: string;
      priority_override?: string;
    };

    if (!case_id) {
      return NextResponse.json({ error: "case_id fehlt." }, { status: 400 });
    }
    if (!original_priority || !priority_override) {
      return NextResponse.json(
        { error: "original_priority und priority_override sind erforderlich." },
        { status: 400 },
      );
    }

    const userId = await requireUserIdFromCookie(request);

    const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: beforeRow } = await supabaseService
      .from("ai_cases")
      .select("tenant_id, company_id, priority_override, original_priority, machine_status")
      .eq("id", case_id)
      .eq("user_id", userId)
      .maybeSingle();

    const { error: updateError } = await supabaseService
      .from("ai_cases")
      .update({
        original_priority,
        priority_override: JSON.stringify({
          original: original_priority,
          override: priority_override,
        }),
      })
      .eq("id", case_id)
      .eq("user_id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const br = beforeRow as {
      tenant_id?: string | null;
      company_id?: string | null;
      priority_override?: unknown;
      original_priority?: string | null;
      machine_status?: string | null;
    } | null;

    const tenantRef = br?.tenant_id ?? br?.company_id ?? null;
    let companyPk: string | null = null;
    if (tenantRef) {
      const { data: co } = await supabaseService
        .from("companies")
        .select("id")
        .eq("tenant_id", tenantRef)
        .maybeSingle();
      companyPk = (co as { id?: string } | null)?.id ?? null;
    }

    void logEvent(
      "repair_case.priority_changed",
      `Priorität des Reparaturfalls geändert (${original_priority} → ${priority_override}).`,
      {
        previous_override: br?.priority_override ?? null,
        previous_original: br?.original_priority ?? null,
        new_original: original_priority,
        new_override: priority_override,
        machine_status: br?.machine_status ?? null,
      },
      {
        service: supabaseService,
        userId,
        companyId: companyPk,
        tenantId: tenantRef,
        aiCaseId: case_id,
      },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interner Fehler beim Speichern.";
    const status = message.includes("Nicht eingeloggt") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

