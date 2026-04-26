import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDbRole } from "@/lib/adminAccess";

export type ProfileRoleDb = "user" | "manager" | "admin";

export function parseProfileRoleToDb(profile_role: unknown): ProfileRoleDb | null {
  const pr = normalizeDbRole(profile_role);
  if (pr === "worker" || pr === "user" || pr === "") return "user";
  if (pr === "manager") return "manager";
  if (pr === "admin") return "admin";
  return null;
}

export async function assertNoSelfPlatformAdminDemotion(
  service: SupabaseClient,
  actorId: string,
  targetUserId: string,
  newRoleDb: ProfileRoleDb,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (targetUserId !== actorId) return { ok: true };
  if (newRoleDb === "admin") return { ok: true };

  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", actorId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  const cur = normalizeDbRole((data as { role?: unknown } | null)?.role);
  if (cur === "admin") {
    return {
      ok: false,
      error:
        "Du kannst dir nicht selbst die Plattform-Admin-Rolle (profiles.role) entziehen.",
    };
  }
  return { ok: true };
}

export async function upsertProfileRoleForUser(
  service: SupabaseClient,
  targetUserId: string,
  profileRoleDb: ProfileRoleDb,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data: profRow, error: profSelErr } = await service
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (profSelErr) {
    return { ok: false, error: profSelErr.message };
  }

  if (profRow) {
    const { error: profUpdErr } = await service
      .from("profiles")
      .update({ role: profileRoleDb, updated_at: now })
      .eq("id", targetUserId);
    if (profUpdErr) {
      return { ok: false, error: profUpdErr.message };
    }
  } else {
    const { error: profInsErr } = await service.from("profiles").insert({
      id: targetUserId,
      role: profileRoleDb,
      updated_at: now,
    });
    if (profInsErr) {
      return { ok: false, error: profInsErr.message };
    }
  }
  return { ok: true };
}
