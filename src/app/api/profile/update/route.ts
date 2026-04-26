import { NextResponse } from "next/server";
import {
  assertNoSelfPlatformAdminDemotion,
  parseProfileRoleToDb,
  upsertProfileRoleForUser,
} from "@/lib/adminProfileRoleUpdate";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";

export const dynamic = "force-dynamic";

type PatchBody = {
  user_id?: string;
  profile_role?: string;
};

export async function PATCH(req: Request) {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const user_id =
    typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!user_id) {
    return NextResponse.json({ error: "user_id fehlt." }, { status: 400 });
  }

  const profileRoleDb = parseProfileRoleToDb(body.profile_role);
  if (!profileRoleDb) {
    return NextResponse.json(
      { error: "profile_role muss worker, manager oder admin sein." },
      { status: 400 },
    );
  }

  const { service, actorId } = ctx;

  const guard = await assertNoSelfPlatformAdminDemotion(
    service,
    actorId,
    user_id,
    profileRoleDb,
  );
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 403 });
  }

  const result = await upsertProfileRoleForUser(service, user_id, profileRoleDb);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
