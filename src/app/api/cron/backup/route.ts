import { NextResponse } from "next/server";
import { runWeeklyBackupNow, shouldRunBackupNow } from "@/lib/backupCron.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function listCronSecrets(): string[] {
  const a = sanitizeEnv(process.env.AXON_CRON_SECRET);
  const b = sanitizeEnv(process.env.CRON_SECRET);
  return [a, b].filter((x): x is string => Boolean(x));
}

function isAuthorized(req: Request): boolean {
  const secrets = listCronSecrets();
  if (secrets.length === 0) return true;

  const bearer = req.headers.get("authorization")?.trim() ?? "";
  const bearerToken =
    bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
  if (bearerToken && secrets.includes(bearerToken)) return true;

  const headerGot = (req.headers.get("x-axon-cron-secret") ?? "").trim();
  return Boolean(headerGot && secrets.includes(headerGot));
}

async function handleBackup(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const force = (req.headers.get("x-axon-backup-force") ?? "").trim() === "1";
  if (!force && !shouldRunBackupNow(new Date())) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Außerhalb des Backup-Zeitfensters (Sonntag 02:00 Europe/Berlin).",
    });
  }

  try {
    const result = await runWeeklyBackupNow();
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      message: result.message,
      object_key: result.key,
      size_bytes: result.size_bytes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Backup fehlgeschlagen.",
      },
      { status: 500 },
    );
  }
}

/** Vercel Cron ruft Route-Handler per GET auf. */
export async function GET(req: Request) {
  return handleBackup(req);
}

export async function POST(req: Request) {
  return handleBackup(req);
}

