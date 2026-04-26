import { randomBytes, createCipheriv, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getGmailClient, getGmailUserEmail } from "@/lib/gmailClient.server";

function sanitizeEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim();
}

function resolvePostgresUrl(): string | null {
  return (
    sanitizeEnv(process.env.AXON_BACKUP_POSTGRES_URL) ??
    sanitizeEnv(process.env.DATABASE_URL) ??
    sanitizeEnv(process.env.POSTGRES_URL) ??
    null
  );
}

function isSundayTwoAmWindow(date: Date, timeZone = "Europe/Berlin"): boolean {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value.toLowerCase() ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "-1");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "-1");
  const isSunday = weekday.startsWith("so");
  return isSunday && hour === 2 && minute >= 0 && minute <= 10;
}

function deriveKey(secret: string): Buffer {
  const raw = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return createHash("sha256").update(raw).digest();
}

function runPgDump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = ["--format=custom", "--no-owner", "--no-privileges", "--dbname", databaseUrl];
    const child = spawn("pg_dump", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => errChunks.push(d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errChunks).toString("utf8") || `pg_dump exited with ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

function encryptDump(input: Buffer, secret: string): Buffer {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const envelope = {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
  };
  const header = Buffer.from(JSON.stringify(envelope), "utf8");
  const headerLen = Buffer.allocUnsafe(4);
  headerLen.writeUInt32BE(header.length, 0);
  return Buffer.concat([headerLen, header, encrypted]);
}

function buildRfc822Email(input: { from: string; to: string; subject: string; body: string }): string {
  const subject = input.subject.replace(/\r?\n/g, " ").trim();
  const body = input.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    "",
  ].join("\r\n");
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sendSuccessMail(to: string, timestamp: string) {
  const from = getGmailUserEmail();
  const gmail = getGmailClient();
  const body = `Backup AxonCore erfolgreich gesichert. Stand: ${timestamp}`;
  const raw = buildRfc822Email({
    from,
    to,
    subject: "AxonCore Backup erfolgreich",
    body,
  });
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: base64UrlEncode(raw) },
  });
}

export async function runWeeklyBackupNow(): Promise<{
  ok: boolean;
  message: string;
  key?: string;
  size_bytes?: number;
}> {
  const dbUrl = resolvePostgresUrl();
  const encryptionSecret = sanitizeEnv(process.env.AXON_BACKUP_ENCRYPTION_KEY);
  const s3Region = sanitizeEnv(process.env.AXON_BACKUP_S3_REGION);
  const s3Bucket = sanitizeEnv(process.env.AXON_BACKUP_S3_BUCKET);
  const s3KeyPrefix = sanitizeEnv(process.env.AXON_BACKUP_S3_PREFIX) ?? "backups/axoncore";
  const adminEmail = sanitizeEnv(process.env.AXON_ADMIN_EMAIL);

  if (!dbUrl) return { ok: false, message: "Postgres URL fehlt (AXON_BACKUP_POSTGRES_URL oder DATABASE_URL)." };
  if (!encryptionSecret) return { ok: false, message: "AXON_BACKUP_ENCRYPTION_KEY fehlt." };
  if (!s3Region || !s3Bucket) return { ok: false, message: "S3 Konfiguration fehlt (AXON_BACKUP_S3_REGION/BUCKET)." };
  if (!adminEmail) return { ok: false, message: "AXON_ADMIN_EMAIL fehlt." };

  const dump = await runPgDump(dbUrl);
  const encrypted = encryptDump(dump, encryptionSecret);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `${s3KeyPrefix.replace(/\/+$/, "")}/axoncore-backup-${stamp}.dump.enc`;

  const s3 = new S3Client({ region: s3Region });
  await s3.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: encrypted,
      ContentType: "application/octet-stream",
      Metadata: {
        encrypted: "aes-256-gcm",
        source: "postgresql",
      },
    }),
  );

  await sendSuccessMail(adminEmail, new Date().toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }));

  return { ok: true, message: "Backup erfolgreich erstellt und hochgeladen.", key, size_bytes: encrypted.byteLength };
}

export function shouldRunBackupNow(date = new Date()): boolean {
  return isSundayTwoAmWindow(date);
}

