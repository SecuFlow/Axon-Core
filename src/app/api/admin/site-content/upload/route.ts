import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";
import { VIDEOS_BUCKET } from "@/lib/supabaseStoragePublic";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

const ALLOWED_TYPES = new Set(["demo", "pilot"]);
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB — bei Vercel ggf. kleinere Limits beachten
const ALLOWED_VIDEO_EXT = /\.(mp4|webm)$/i;

function safeFileSegment(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "video";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "video";
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
  const typeRaw = typeof formData.get("type") === "string" ? formData.get("type") : "";
  const titleRaw = typeof formData.get("title") === "string" ? formData.get("title") : "";

  const type = String(typeRaw).trim();
  const title = String(titleRaw).trim();

  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Datei fehlt oder ist leer." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json(
      { error: "Typ muss demo oder pilot sein." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!title) {
    return NextResponse.json({ error: "Titel ist erforderlich." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Datei ist zu groß (max. 500 MB)." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const mime = file.type || "";
  const looksVideo =
    mime.startsWith("video/") ||
    mime === "application/octet-stream" ||
    ALLOWED_VIDEO_EXT.test(file.name);
  if (!looksVideo) {
    return NextResponse.json(
      { error: "Bitte eine Videodatei hochladen." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const extOk = ALLOWED_VIDEO_EXT.test(file.name) || mime === "video/mp4" || mime === "video/webm";
  if (!extOk) {
    return NextResponse.json(
      { error: "Bitte MP4 oder WebM hochladen." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const uploadMime = mime || "video/mp4";

  const segment = safeFileSegment(file.name);
  const objectPath = `${type}/${Date.now()}-${segment}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await ctx.service.storage
    .from(VIDEOS_BUCKET)
    .upload(objectPath, buffer, {
      contentType: uploadMime,
      upsert: false,
      cacheControl: "31536000",
    });

  if (upErr) {
    return NextResponse.json(
      { error: `Storage: ${upErr.message}` },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const { data: pub } = ctx.service.storage
    .from(VIDEOS_BUCKET)
    .getPublicUrl(objectPath);

  const publicUrl = pub.publicUrl;

  const { data: row, error: insErr } = await ctx.service
    .from("site_content")
    .insert({
      type,
      url: publicUrl,
      title,
    })
    .select("id,type,url,title,created_at")
    .single();

  if (insErr || !row) {
    await ctx.service.storage.from(VIDEOS_BUCKET).remove([objectPath]);
    return NextResponse.json(
      { error: insErr?.message ?? "Eintrag konnte nicht gespeichert werden." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  // Transcoding-Job enqueue (best-effort). Output wird später auf web-optimierte Varianten umgestellt.
  try {
    await ctx.service.from("media_transcode_jobs").upsert(
      {
        site_content_id: row.id,
        bucket: VIDEOS_BUCKET,
        object_path: objectPath,
        status: "pending",
        attempts: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_content_id" },
    );
  } catch {
    // Upload darf niemals wegen Queue fehlschlagen.
  }

  return NextResponse.json({ item: row }, { headers: NO_STORE_HEADERS });
}
