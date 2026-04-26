import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { runLeadmaschine } from "@/lib/leadmaschineRunner.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export async function POST() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const res = await runLeadmaschine({ service: ctx.service, actorId: ctx.actorId });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 500, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json(res, { headers: NO_STORE_HEADERS });
}

