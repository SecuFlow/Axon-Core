import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const locId = (id ?? "").trim();
  if (!locId) {
    return NextResponse.json({ error: "Mandat-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (!UUID_RE.test(locId)) {
    return NextResponse.json(
      { error: "Ungültige Mandat-ID." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const delMandate = await ctx.service.from("mandates").delete().eq("id", locId);
  const error =
    delMandate.error?.message?.toLowerCase().includes("mandates")
      ? (await ctx.service.from("locations").delete().eq("id", locId)).error
      : delMandate.error;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
