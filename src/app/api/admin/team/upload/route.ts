import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";

export const dynamic = "force-dynamic";

const TEAM_BUCKET = "team";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB – bewusst strikt für WebP

function safeFileSegment(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "photo.webp";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "photo.webp";
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
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Datei fehlt oder ist leer." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Datei ist zu groß (max. 8 MB)." },
      { status: 400 },
    );
  }

  const mime = file.type || "";
  const isWebp = mime === "image/webp" || /\.webp$/i.test(file.name);
  if (!isWebp) {
    return NextResponse.json(
      { error: "Bitte ein WebP-Foto hochladen (.webp)." },
      { status: 400 },
    );
  }

  const segment = safeFileSegment(file.name);
  const objectPath = `team/${Date.now()}-${segment.replace(/\.(png|jpg|jpeg)$/i, ".webp")}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await ctx.service.storage.from(TEAM_BUCKET).upload(
    objectPath,
    buffer,
    {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "31536000",
    },
  );

  if (upErr) {
    return NextResponse.json({ error: `Storage: ${upErr.message}` }, { status: 500 });
  }

  const { data: pub } = ctx.service.storage
    .from(TEAM_BUCKET)
    .getPublicUrl(objectPath);

  return NextResponse.json({ url: pub.publicUrl, path: objectPath });
}

