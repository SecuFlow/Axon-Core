import { NextResponse } from "next/server";
import { normalizeDbRole } from "@/lib/adminAccess";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";
import { NO_STORE_HEADERS, PRIVATE_SWR_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";

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

  // Drei unabhängige Reads parallel: GoTrue listUsers + companies + profiles.
  // Vorher 3× sequenzielle Latenz, jetzt max(latenz). listUsers ist davon der
  // langsamste Call (~150–400 ms via GoTrue API), die DB-Reads laufen on-top.
  const [authListRes, companyRowsRes, profileRowsRes] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: 500 }),
    service.from("companies").select("user_id,name,role,is_subscribed"),
    service.from("profiles").select("id, role, company_id"),
  ]);

  if (authListRes.error) {
    return NextResponse.json(
      { error: authListRes.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  if (companyRowsRes.error) {
    return NextResponse.json(
      { error: companyRowsRes.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  if (profileRowsRes.error) {
    return NextResponse.json(
      { error: profileRowsRes.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const listData = authListRes.data;
  const companyRows = companyRowsRes.data;
  const profileRows = profileRowsRes.data;

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

  return NextResponse.json(
    { users, actorId: ctx.actorId },
    { headers: PRIVATE_SWR_HEADERS },
  );
}
