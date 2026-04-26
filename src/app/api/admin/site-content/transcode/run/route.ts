import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";
import { VIDEOS_BUCKET } from "@/lib/supabaseStoragePublic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function sanitizeEnv(v: string | undefined) {
  if (!v) return undefined;
  return v.replace(/\s/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

async function runFfmpeg(input: {
  spawn: typeof import("node:child_process").spawn;
  args: string[];
  timeoutMs?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bin = sanitizeEnv(process.env.FFMPEG_PATH) || "ffmpeg";
  const timeoutMs = input.timeoutMs ?? 120_000;
  return await new Promise((resolve) => {
    const p = input.spawn(bin, input.args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const t = setTimeout(() => {
      try {
        p.kill("SIGKILL");
      } catch {}
      resolve({ ok: false, error: "ffmpeg timeout" });
    }, timeoutMs);
    p.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    p.on("error", (e) => {
      clearTimeout(t);
      resolve({ ok: false, error: e instanceof Error ? e.message : "ffmpeg spawn error" });
    });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) return resolve({ ok: true });
      resolve({ ok: false, error: stderr.trim() || `ffmpeg exit ${code ?? "?"}` });
    });
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;

  const [{ spawn }, { promises: fs }, os, path] = await Promise.all([
    import("node:child_process"),
    import("node:fs"),
    import("node:os"),
    import("node:path"),
  ]);

  const force = req.nextUrl.searchParams.get("force") === "1";

  const jobRes = await ctx.service
    .from("media_transcode_jobs")
    .select("id, site_content_id, bucket, object_path, status, attempts")
    .in("status", force ? ["pending", "failed", "skipped", "done"] : ["pending", "failed"])
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (jobRes.error) {
    if (jobRes.error.message.includes("media_transcode_jobs")) {
      return NextResponse.json(
        { error: "Transcoding-Queue ist noch nicht migriert. Bitte Supabase-Migration ausführen." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ error: jobRes.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const job = jobRes.data as
    | { id: string; site_content_id: string; bucket: string; object_path: string; status: string; attempts: number }
    | null;

  if (!job?.id) return NextResponse.json({ ok: true, processed: 0 }, { headers: NO_STORE_HEADERS });

  const ffmpegWanted = (sanitizeEnv(process.env.FFMPEG_PATH) ?? "").trim();
  if (!ffmpegWanted && process.env.AXON_TRANSCODE_ENABLED === "false") {
    await ctx.service
      .from("media_transcode_jobs")
      .update({ status: "skipped", last_error: "Transcoding disabled", updated_at: nowIso() })
      .eq("id", job.id);
    return NextResponse.json({ ok: true, processed: 0, skipped: true }, { headers: NO_STORE_HEADERS });
  }

  // mark running
  await ctx.service
    .from("media_transcode_jobs")
    .update({ status: "running", attempts: (job.attempts ?? 0) + 1, last_error: null, updated_at: nowIso() })
    .eq("id", job.id);

  // download source (storage)
  const dl = await ctx.service.storage.from(job.bucket || VIDEOS_BUCKET).download(job.object_path);
  if (dl.error || !dl.data) {
    await ctx.service
      .from("media_transcode_jobs")
      .update({ status: "failed", last_error: dl.error?.message ?? "download failed", updated_at: nowIso() })
      .eq("id", job.id);
    return NextResponse.json(
      { error: dl.error?.message ?? "Download fehlgeschlagen." },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }

  // temp folder is runtime-only; keep Turbopack from over-tracing
  const tmpDir = await fs.mkdtemp(
    path.join(/* turbopackIgnore: true */ os.tmpdir(), "axon-tx-"),
  );
  const srcPath = path.join(tmpDir, "src.mp4");
  const mp4Path = path.join(tmpDir, "out.mp4");
  const webmPath = path.join(tmpDir, "out.webm");

  try {
    const buf = Buffer.from(await dl.data.arrayBuffer());
    await fs.writeFile(srcPath, buf);

    // MP4: H.264 + AAC, 720p max, moderate bitrate
    const mp4Args = [
      "-y",
      "-i",
      srcPath,
      "-vf",
      "scale='min(1280,iw)':-2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "27",
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      mp4Path,
    ];
    const mp4Run = await runFfmpeg({ spawn, args: mp4Args, timeoutMs: 180_000 });
    if (!mp4Run.ok) throw new Error(`ffmpeg mp4: ${mp4Run.error}`);

    // WebM: VP9 + Opus, 720p max
    const webmArgs = [
      "-y",
      "-i",
      srcPath,
      "-vf",
      "scale='min(1280,iw)':-2",
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "33",
      "-b:v",
      "0",
      "-row-mt",
      "1",
      "-threads",
      "4",
      "-c:a",
      "libopus",
      "-b:a",
      "96k",
      webmPath,
    ];
    const webmRun = await runFfmpeg({ spawn, args: webmArgs, timeoutMs: 240_000 });
    if (!webmRun.ok) throw new Error(`ffmpeg webm: ${webmRun.error}`);

    const baseName = job.object_path.replace(/[^a-zA-Z0-9/_-]/g, "_").slice(0, 160);
    const outMp4Object = `transcoded/${baseName}.mp4`;
    const outWebmObject = `transcoded/${baseName}.webm`;

    const mp4Buf = await fs.readFile(mp4Path);
    const webmBuf = await fs.readFile(webmPath);

    const up1 = await ctx.service.storage.from(job.bucket || VIDEOS_BUCKET).upload(outMp4Object, mp4Buf, {
      contentType: "video/mp4",
      upsert: true,
      cacheControl: "31536000",
    });
    if (up1.error) throw new Error(`upload mp4: ${up1.error.message}`);

    const up2 = await ctx.service.storage.from(job.bucket || VIDEOS_BUCKET).upload(outWebmObject, webmBuf, {
      contentType: "video/webm",
      upsert: true,
      cacheControl: "31536000",
    });
    if (up2.error) throw new Error(`upload webm: ${up2.error.message}`);

    const pubMp4 = ctx.service.storage.from(job.bucket || VIDEOS_BUCKET).getPublicUrl(outMp4Object).data.publicUrl;
    const pubWebm = ctx.service.storage.from(job.bucket || VIDEOS_BUCKET).getPublicUrl(outWebmObject).data.publicUrl;

    // Update site_content to prefer the optimized MP4 url.
    await ctx.service.from("site_content").update({ url: pubMp4 }).eq("id", job.site_content_id);

    await ctx.service
      .from("media_transcode_jobs")
      .update({
        status: "done",
        output_urls: { mp4: pubMp4, webm: pubWebm },
        last_error: null,
        updated_at: nowIso(),
      })
      .eq("id", job.id);

    return NextResponse.json(
      { ok: true, processed: 1, output: { mp4: pubMp4, webm: pubWebm } },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transcoding fehlgeschlagen.";
    await ctx.service
      .from("media_transcode_jobs")
      .update({ status: "failed", last_error: msg.slice(0, 2000), updated_at: nowIso() })
      .eq("id", job.id);
    return NextResponse.json({ error: msg }, { status: 502, headers: NO_STORE_HEADERS });
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

