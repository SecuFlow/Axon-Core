import { NextResponse } from "next/server";
import { normalizeDbRole } from "@/lib/adminAccess";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export type AdminRoleUi = "mitarbeiter" | "manager" | "admin";

export type AdminUserListItem = {
  id: string;
  email: string;
  name: string | null;
  role: AdminRoleUi;
  is_subscribed: boolean;
};

function roleUiFromDb(role: unknown): AdminRoleUi {
  const r = normalizeDbRole(role);
  if (r === "admin") return "admin";
  if (r === "manager") return "manager";
  return "mitarbeiter";
}

export async function GET() {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;

  const { service } = ctx;

  const { data: listData, error: listError } =
    await service.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });

  if (listError) {
    return NextResponse.json(
      { error: listError.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const { data: companyRows, error: companyError } = await service
    .from("companies")
    .select("user_id,name,role,is_subscribed");

  if (companyError) {
    return NextResponse.json(
      { error: companyError.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const { data: profileRows, error: profileError } = await service
    .from("profiles")
    .select("id, role, company_id");

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const profileByUser = new Map<
    string,
    { role: unknown; company_id: string | null }
  >();
  for (const row of profileRows ?? []) {
    const id = (row as { id?: string }).id;
    if (typeof id !== "string" || !id) continue;
    const cid = (row as { company_id?: string | null }).company_id;
    profileByUser.set(id, {
      role: (row as { role?: unknown }).role,
      company_id:
        typeof cid === "string" && cid.trim().length > 0 ? cid.trim() : null,
    });
  }

  const byUser = new Map<
    string,
    { name: string | null; role: string; is_subscribed: boolean }
  >();
  for (const row of companyRows ?? []) {
    const uid = row.user_id as string;
    byUser.set(uid, {
      name: (row.name as string | null) ?? null,
      role: normalizeDbRole(row.role) || "user",
      is_subscribed: row.is_subscribed === true,
    });
  }

  const users = listData.users.map((u) => {
    const c = byUser.get(u.id);
    const r = roleUiFromDb(c?.role);
    const prof = profileByUser.get(u.id);
    const profileRole = roleUiFromDb(prof?.role);
    const role =
      r === "admin" || profileRole === "admin"
        ? "admin"
        : r === "manager" || profileRole === "manager"
          ? "manager"
          : "mitarbeiter";
    return {
      id: u.id,
      email: u.email ?? "",
      name: c?.name ?? null,
      role,
      is_subscribed: c?.is_subscribed ?? false,
    } satisfies AdminUserListItem;
  });

  return NextResponse.json({ users, actorId: ctx.actorId }, { headers: NO_STORE_HEADERS });
}
