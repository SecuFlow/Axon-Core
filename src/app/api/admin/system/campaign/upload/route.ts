import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";
import { VIDEOS_BUCKET } from "@/lib/supabaseStoragePublic";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

const MAX_BYTES = 10 * 1024 * 1024;

function safeFileSegment(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "banner.jpg";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "banner.jpg";
}

function inferExtension(file: File): string {
  const t = (file.type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  return "jpg";
}

export async function POST(req: Request) {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Ungültiges Formular (Multipart)." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Datei fehlt oder ist leer." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Datei ist zu groß (max. 10 MB)." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Bitte eine Bilddatei hochladen." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const objectPath = `campaign/banners/${Date.now()}-${safeFileSegment(file.name).replace(/\.[^.]+$/, "")}.${inferExtension(file)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await ctx.service.storage
    .from(VIDEOS_BUCKET)
    .upload(objectPath, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
      cacheControl: "31536000",
    });
  if (upErr) {
    return NextResponse.json(
      { error: `Storage: ${upErr.message}` },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const { data: pub } = ctx.service.storage.from(VIDEOS_BUCKET).getPublicUrl(objectPath);

  return NextResponse.json({ url: pub.publicUrl }, { headers: NO_STORE_HEADERS });
}
