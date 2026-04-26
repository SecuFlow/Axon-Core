import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { getStripeServer } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type CheckResult = {
  key: "database" | "mail" | "stripe" | "storage";
  label: string;
  ok: boolean;
  detail: string;
};

function sanitizeEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

async function checkDb(
  service: Extract<Awaited<ReturnType<typeof requireAdminMutationContext>>, { ok: true }>["service"],
): Promise<CheckResult> {
  const t0 = Date.now();
  const ping = await service.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
  const latency = Date.now() - t0;
  if (ping.error) {
    return {
      key: "database",
      label: "Datenbank",
      ok: false,
      detail: `Verbindung fehlgeschlagen: ${ping.error.message}`,
    };
  }

  const requiredTables = ["team_members", "mandates"] as const;
  const checks = await Promise.all(
    requiredTables.map(async (table) => {
      const res = await service.from(table).select("id", { head: true, count: "exact" }).limit(1);
      return { table, ok: !res.error, error: res.error?.message ?? null };
    }),
  );
  const missing = checks.filter((c) => !c.ok);
  if (missing.length > 0) {
    return {
      key: "database",
      label: "Datenbank",
      ok: false,
      detail: `Migration unvollständig: ${missing.map((m) => `${m.table} (${m.error})`).join("; ")}`,
    };
  }

  return {
    key: "database",
    label: "Datenbank",
    ok: true,
    detail: `Verbindung stabil (${latency} ms), Tabellen team_members + mandates verfügbar.`,
  };
}

async function checkMail(): Promise<CheckResult> {
  const clientId = sanitizeEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = sanitizeEnv(process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = sanitizeEnv(process.env.GOOGLE_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) {
    return {
      key: "mail",
      label: "Mail-Server (Gmail API)",
      ok: false,
      detail: "Google OAuth Umgebungsvariablen fehlen.",
    };
  }

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const token = await oauth2.getAccessToken();
    if (!token.token) {
      return {
        key: "mail",
        label: "Mail-Server (Gmail API)",
        ok: false,
        detail: "Kein Access Token erhalten (Refresh Token prüfen).",
      };
    }
    const info = await oauth2.getTokenInfo(token.token);
    return {
      key: "mail",
      label: "Mail-Server (Gmail API)",
      ok: true,
      detail: `Token gültig für Client ${info.aud ?? "unbekannt"}.`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Tokenprüfung fehlgeschlagen.";
    return {
      key: "mail",
      label: "Mail-Server (Gmail API)",
      ok: false,
      detail: msg,
    };
  }
}

async function checkStripe(): Promise<CheckResult> {
  const stripe = getStripeServer();
  if (!stripe) {
    return {
      key: "stripe",
      label: "Stripe Webhooks",
      ok: false,
      detail: "STRIPE_SECRET_KEY fehlt.",
    };
  }
  try {
    const list = await stripe.webhookEndpoints.list({ limit: 25 });
    const enabled = list.data.filter((x) => x.status === "enabled");
    const relevant = enabled.filter((x) => x.url.includes("/api/webhooks/stripe"));
    if (relevant.length === 0) {
      return {
        key: "stripe",
        label: "Stripe Webhooks",
        ok: false,
        detail: "Kein aktiver Endpoint auf /api/webhooks/stripe gefunden.",
      };
    }
    return {
      key: "stripe",
      label: "Stripe Webhooks",
      ok: true,
      detail: `${relevant.length} aktiver Endpoint erreichbar/konfiguriert.`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Webhook-Check fehlgeschlagen.";
    return {
      key: "stripe",
      label: "Stripe Webhooks",
      ok: false,
      detail: msg,
    };
  }
}

async function checkStorage(
  service: Extract<Awaited<ReturnType<typeof requireAdminMutationContext>>, { ok: true }>["service"],
): Promise<CheckResult> {
  try {
    const buckets = await service.storage.listBuckets();
    if (buckets.error) {
      return {
        key: "storage",
        label: "Cloud-Speicher",
        ok: false,
        detail: `Bucket-Zugriff fehlgeschlagen: ${buckets.error.message}`,
      };
    }

    const bucketNames = (buckets.data ?? []).map((b) => b.name);
    if (bucketNames.length === 0) {
      return {
        key: "storage",
        label: "Cloud-Speicher",
        ok: false,
        detail: "Keine Storage-Buckets gefunden.",
      };
    }

    const objRes = await service
      .from("storage.objects")
      .select("metadata")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (objRes.error) {
      return {
        key: "storage",
        label: "Cloud-Speicher",
        ok: false,
        detail: `Objekt-Check fehlgeschlagen: ${objRes.error.message}`,
      };
    }

    let usedBytes = 0;
    for (const row of objRes.data ?? []) {
      const metadata = (row as { metadata?: unknown }).metadata as { size?: unknown } | undefined;
      const size = typeof metadata?.size === "number" ? metadata.size : 0;
      if (Number.isFinite(size) && size > 0) usedBytes += size;
    }

    const maxMb = Number(process.env.DIAGNOSTIC_STORAGE_MAX_MB ?? "5120");
    const maxBytes = Number.isFinite(maxMb) && maxMb > 0 ? Math.round(maxMb * 1024 * 1024) : 0;
    const usagePct = maxBytes > 0 ? (usedBytes / maxBytes) * 100 : null;
    const usedMb = (usedBytes / 1024 / 1024).toFixed(1);
    const ok = usagePct == null ? true : usagePct < 90;

    return {
      key: "storage",
      label: "Cloud-Speicher",
      ok,
      detail:
        usagePct == null
          ? `${bucketNames.length} Buckets verfügbar, Nutzung ~${usedMb} MB (5000 Objekte geprüft).`
          : `${bucketNames.length} Buckets verfügbar, Nutzung ~${usedMb} MB von ${maxMb} MB (${usagePct.toFixed(1)}%).`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Storage-Check fehlgeschlagen.";
    return {
      key: "storage",
      label: "Cloud-Speicher",
      ok: false,
      detail: msg,
    };
  }
}

export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const [database, mail, stripe, storage] = await Promise.all([
    checkDb(ctx.service),
    checkMail(),
    checkStripe(),
    checkStorage(ctx.service),
  ]);

  const checks: CheckResult[] = [database, mail, stripe, storage];
  return NextResponse.json(
    {
      ok: checks.every((c) => c.ok),
      checks,
      generated_at: new Date().toISOString(),
    },
    { headers: NO_STORE_HEADERS },
  );
}

