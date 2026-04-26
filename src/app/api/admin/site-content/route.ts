import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export type SiteContentRow = {
  id: string;
  type: string;
  url?: string;
  title: string;
  created_at: string;
};

export async function GET() {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;

  const first = await ctx.service
    .from("site_content")
    .select("id,type,url,title,created_at")
    .order("created_at", { ascending: false });

  if (!first.error) {
    return NextResponse.json({ items: (first.data ?? []) as SiteContentRow[] }, { headers: NO_STORE_HEADERS });
  }

  const msg = first.error.message ?? "";
  if (msg.includes("column site_content.url does not exist")) {
    const fallback = await ctx.service
      .from("site_content")
      .select("id,type,title,created_at")
      .order("created_at", { ascending: false });

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const items = ((fallback.data ?? []) as Array<Omit<SiteContentRow, "url">>).map(
      (row) => ({ ...row, url: "" }),
    ) as SiteContentRow[];

    return NextResponse.json({ items }, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ error: msg }, { status: 500, headers: NO_STORE_HEADERS });
}
