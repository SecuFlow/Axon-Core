import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

type Body = {
  currentPassword?: string;
  newPassword?: string;
};

function isValidPassword(p: string): boolean {
  return p.trim().length >= 8;
}

export async function PATCH(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  if (!isValidPassword(currentPassword) || !isValidPassword(newPassword)) {
    return NextResponse.json(
      { error: "Passwörter müssen mindestens 8 Zeichen haben." },
      { status: 400 },
    );
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "Das neue Passwort muss sich vom alten unterscheiden." },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!accessToken || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const userScoped = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user?.email) {
    return NextResponse.json({ error: "Sitzung ungültig." }, { status: 401 });
  }

  const verify = await userScoped.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verify.error) {
    return NextResponse.json(
      { error: "Aktuelles Passwort ist falsch." },
      { status: 401 },
    );
  }

  const updated = await userScoped.auth.updateUser({ password: newPassword });
  if (updated.error) {
    return NextResponse.json(
      { error: updated.error.message ?? "Passwort konnte nicht aktualisiert werden." },
      { status: 400 },
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await service
    .from("profiles")
    .update({
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
