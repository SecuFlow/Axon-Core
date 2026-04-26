import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const res = await ctx.service
    .from("audit_logs")
    .select("id, created_at, action, description, user_id, tenant_id, metadata")
    .ilike("action", "security.%")
    .order("created_at", { ascending: false })
    .limit(200);

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ items: res.data ?? [] }, { headers: NO_STORE_HEADERS });
}

