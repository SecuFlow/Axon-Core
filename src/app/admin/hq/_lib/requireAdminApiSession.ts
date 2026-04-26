import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "./requireAdminMutationContext";

export type AdminApiContext = {
  service: import("@supabase/supabase-js").SupabaseClient;
  actorId: string;
};

/**
 * Route Handler: gleiche Admin-Regeln wie assertAdminHqAccess, liefert Service-Client.
 */
export async function requireAdminApiSession(): Promise<
  AdminApiContext | NextResponse
> {
  const r = await requireAdminMutationContext();
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  return { service: r.service, actorId: r.actorId };
}
