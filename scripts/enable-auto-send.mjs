/**
 * Aktiviert auto_send_enabled in leadmaschine_settings (Master-Switch fuer Auto-Versand).
 *
 * Verwendung:
 *   node --env-file=.env.production.local scripts/enable-auto-send.mjs
 *   node --env-file=.env.production.local scripts/enable-auto-send.mjs --off  (deaktiviert)
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\s/g, "") ?? "";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s/g, "") ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("FEHLER: Supabase-Credentials fehlen.");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const off = process.argv.slice(2).includes("--off");
const newValue = !off;

async function rest(method, path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const before = await rest(
  "GET",
  "leadmaschine_settings?select=id,enabled,auto_send_enabled,updated_at&order=updated_at.desc&limit=1",
);
if (!Array.isArray(before) || before.length === 0) {
  console.error(
    "FEHLER: Kein leadmaschine_settings-Eintrag gefunden. Bitte zuerst im HQ-UI initial speichern.",
  );
  process.exit(1);
}
const row = before[0];

console.log(`\nVorher:  enabled=${row.enabled}  auto_send_enabled=${row.auto_send_enabled}`);

const upd = await rest(
  "PATCH",
  `leadmaschine_settings?id=eq.${encodeURIComponent(row.id)}`,
  { auto_send_enabled: newValue },
);
const after = Array.isArray(upd) ? upd[0] : upd;
console.log(
  `Nachher: enabled=${after.enabled}  auto_send_enabled=${after.auto_send_enabled}\n`,
);
console.log(
  newValue
    ? "✓ Auto-Send aktiviert. Cron wird vorbereitete Drafts beim naechsten Lauf versenden."
    : "✓ Auto-Send deaktiviert. Cron erstellt nur Drafts.",
);
