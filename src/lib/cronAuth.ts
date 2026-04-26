// Zentrale Auth-Pr\u00fcfung f\u00fcr Cron-Endpoints.
//
// Akzeptiert ZWEI Varianten:
//   1) Vercel-Cron-Standard:  Authorization: Bearer <CRON_SECRET>
//   2) Legacy/eigener Header: x-axon-cron-secret: <AXON_CRON_SECRET>
//
// Ist KEIN Secret konfiguriert, wird der Zugriff zugelassen (Dev-Komfort).
// In Production sollte mindestens eines der beiden Secrets gesetzt sein.

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function verifyCronAuth(req: Request): CronAuthResult {
  const vercelSecret = sanitizeEnv(process.env.CRON_SECRET);
  const axonSecret = sanitizeEnv(process.env.AXON_CRON_SECRET);

  if (!vercelSecret && !axonSecret) {
    return { ok: true };
  }

  if (vercelSecret) {
    const raw = req.headers.get("authorization") ?? "";
    const match = raw.match(/^Bearer\s+(.+)$/i);
    if (match) {
      const token = match[1].trim();
      if (constantTimeEqual(token, vercelSecret)) return { ok: true };
    }
  }

  if (axonSecret) {
    const got = (req.headers.get("x-axon-cron-secret") ?? "").trim();
    if (got && constantTimeEqual(got, axonSecret)) return { ok: true };
  }

  return { ok: false, status: 401, error: "Nicht autorisiert." };
}
