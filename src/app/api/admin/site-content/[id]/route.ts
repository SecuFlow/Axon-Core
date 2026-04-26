import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";
import {
  storageObjectPathFromPublicUrl,
  VIDEOS_BUCKET,
} from "@/lib/supabaseStoragePublic";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const { data: row, error: selErr } = await ctx.service
    .from("site_content")
    .select("url")
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  if (!row?.url) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const objectPath = storageObjectPathFromPublicUrl(String(row.url));
  if (objectPath) {
    const { error: rmErr } = await ctx.service.storage
      .from(VIDEOS_BUCKET)
      .remove([objectPath]);
    if (rmErr) {
      console.error("[site-content delete] storage remove:", rmErr.message);
    }
  }

  const { error: delErr } = await ctx.service
    .from("site_content")
    .delete()
    .eq("id", id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
