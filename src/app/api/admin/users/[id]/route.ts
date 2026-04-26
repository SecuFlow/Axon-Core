import { NextResponse } from "next/server";
import { normalizeDbRole } from "@/lib/adminAccess";
import {
  type ProfileRoleDb,
} from "@/lib/adminProfileRoleUpdate";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type PatchBody = {
  email?: string;
  password?: string;
  is_subscribed?: boolean;
  role?: string;
};

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;

  const { id: targetUserId } = await context.params;
  if (!targetUserId) {
    return NextResponse.json({ error: "User-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  let body: PatchBody = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const { service } = ctx;

  const email =
    typeof body.email === "string" ? body.email.trim() : undefined;
  const password =
    typeof body.password === "string" ? body.password : undefined;
  const hasPassword = password != null && password.length > 0;

  if (hasPassword && password.length < 8) {
    return NextResponse.json(
      { error: "Passwort muss mindestens 8 Zeichen haben." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (body.is_subscribed !== undefined && typeof body.is_subscribed !== "boolean") {
    return NextResponse.json(
      { error: "is_subscribed muss boolean sein." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let roleNorm: "admin" | "manager" | "user" | undefined;
  if (body.role !== undefined) {
    const r = normalizeDbRole(body.role);
    if (r !== "admin" && r !== "manager" && r !== "mitarbeiter" && r !== "user") {
      return NextResponse.json(
        { error: "Rolle muss admin, manager oder mitarbeiter sein." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    roleNorm = r === "mitarbeiter" ? "user" : (r as "admin" | "manager" | "user");
  }

  const authUpdate: { email?: string; password?: string } = {};
  if (email !== undefined) {
    if (!email) {
      return NextResponse.json(
        { error: "E-Mail darf nicht leer sein." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    authUpdate.email = email;
  }
  if (hasPassword) {
    authUpdate.password = password;
  }

  if (Object.keys(authUpdate).length > 0) {
    const { error: authErr } = await service.auth.admin.updateUserById(
      targetUserId,
      authUpdate,
    );
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400, headers: NO_STORE_HEADERS });
    }
  }

  const companyPatch: Record<string, unknown> = {};
  if (body.is_subscribed === false && roleNorm !== "manager") {
    const { data: currentCompanyRole } = await service
      .from("companies")
      .select("role")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const existingRoleNorm = normalizeDbRole(
      (currentCompanyRole as { role?: unknown } | null)?.role,
    );
    if (existingRoleNorm === "manager") {
      return NextResponse.json(
        { error: "Manager ist fest mit aktivem Stripe-Abo verknüpft." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
  }
  if (body.is_subscribed !== undefined) {
    companyPatch.is_subscribed = body.is_subscribed;
  }
  if (roleNorm !== undefined) {
    companyPatch.role = roleNorm;
  }

  if (Object.keys(companyPatch).length > 0) {
    const { data: existing, error: selErr } = await service
      .from("companies")
      .select("user_id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (!existing) {
      const { data: authUser } = await service.auth.admin.getUserById(
        targetUserId,
      );
      const fallbackMail = authUser.user?.email ?? "";
      const displayEmail = email ?? fallbackMail;
      const { error: insErr } = await service.from("companies").insert({
        user_id: targetUserId,
        name: displayEmail || "Neuer Konzern",
        role: roleNorm ?? "user",
        is_subscribed:
          roleNorm === "manager"
            ? true
            : body.is_subscribed === undefined
              ? false
              : body.is_subscribed,
      });
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500, headers: NO_STORE_HEADERS });
      }
    } else {
      if (roleNorm === "manager") {
        companyPatch.is_subscribed = true;
      }
      const { error: updErr } = await service
        .from("companies")
        .update(companyPatch)
        .eq("user_id", targetUserId);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500, headers: NO_STORE_HEADERS });
      }
    }
  }

  if (roleNorm !== undefined) {
    const profileRoleDb: ProfileRoleDb = roleNorm;
    const now = new Date().toISOString();
    const { data: existingProfile, error: profileSelErr } = await service
      .from("profiles")
      .select("id")
      .eq("id", targetUserId)
      .maybeSingle();
    if (profileSelErr) {
      return NextResponse.json({ error: profileSelErr.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (existingProfile) {
      const { error: profileUpdErr } = await service
        .from("profiles")
        .update({ role: profileRoleDb, updated_at: now })
        .eq("id", targetUserId);
      if (profileUpdErr) {
        return NextResponse.json({ error: profileUpdErr.message }, { status: 500, headers: NO_STORE_HEADERS });
      }
    } else {
      const { error: profileInsErr } = await service
        .from("profiles")
        .insert({ id: targetUserId, role: profileRoleDb, updated_at: now });
      if (profileInsErr) {
        return NextResponse.json({ error: profileInsErr.message }, { status: 500, headers: NO_STORE_HEADERS });
      }
    }
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
