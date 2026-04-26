"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  Database,
  Factory,
  Plug,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";

type Category = "accounting" | "machines" | "crm" | "other";
type Status = "connected" | "paused" | "error";

type Integration = {
  id: string;
  mandant_id: string;
  company_id: string | null;
  category: Category;
  provider: string;
  display_name: string | null;
  status: Status;
  api_endpoint: string | null;
  api_key_hint: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
};

type ProviderDef = {
  id: string;
  label: string;
  description: string;
  endpointHint: string;
  keyHint: string;
};

const CATEGORY_META: Record<
  Category,
  {
    label: string;
    description: string;
    icon: typeof Database;
    providers: ProviderDef[];
  }
> = {
  accounting: {
    label: "Buchhaltung",
    description: "Verbinde Buchhaltungs-Software für automatische Belege & KPI-Sync.",
    icon: Database,
    providers: [
      {
        id: "datev",
        label: "DATEV Unternehmen Online",
        description: "Steuerberater-Standard in DACH. API-Key oder OAuth-Token.",
        endpointHint: "https://api.datev.de/...",
        keyHint: "DATEV API Key",
      },
      {
        id: "lexware",
        label: "Lexware Office",
        description: "Kleinere Konzerne / Mittelstand.",
        endpointHint: "https://api.lexoffice.io/v1",
        keyHint: "Lexware API Key",
      },
      {
        id: "sap",
        label: "SAP S/4HANA",
        description: "Enterprise-Finance ERP mit OData-Endpoint.",
        endpointHint: "https://sap.konzern.de/odata/FI",
        keyHint: "SAP Service User",
      },
      {
        id: "custom-accounting",
        label: "Eigenes Buchhaltungs-System",
        description: "Freier Endpoint mit API-Key / Bearer-Token.",
        endpointHint: "https://api.konzern.de/bu",
        keyHint: "API Key / Bearer",
      },
    ],
  },
  machines: {
    label: "Maschinen-APIs",
    description:
      "Maschinen direkt anbinden — sonst übernimmt KI-Heuristik Status & kWh.",
    icon: Factory,
    providers: [
      {
        id: "siemens-mindsphere",
        label: "Siemens MindSphere",
        description: "Industrie-IoT-Plattform für Maschinen-Telemetrie.",
        endpointHint: "https://gateway.eu1.mindsphere.io/api/...",
        keyHint: "MindSphere Client Secret",
      },
      {
        id: "opc-ua",
        label: "OPC UA Gateway",
        description: "Standard-Protokoll für SPS/Fertigungs­automation.",
        endpointHint: "opc.tcp://gateway.konzern.de:4840",
        keyHint: "Gateway Token",
      },
      {
        id: "mqtt",
        label: "MQTT Broker",
        description: "Leichtgewichtiges Pub/Sub für Sensorik.",
        endpointHint: "mqtts://broker.konzern.de:8883",
        keyHint: "MQTT User/Passwort",
      },
      {
        id: "custom-machine",
        label: "Eigenes Maschinen-Netz",
        description: "Beliebiger REST-Endpoint mit Auth.",
        endpointHint: "https://machines.konzern.de/status",
        keyHint: "API Key",
      },
    ],
  },
  crm: {
    label: "CRM / Vertrieb",
    description: "Kunden- und Lead-Daten in AxonCore einspielen.",
    icon: Users,
    providers: [
      {
        id: "hubspot",
        label: "HubSpot",
        description: "Weit verbreitetes CRM mit Rest-API.",
        endpointHint: "https://api.hubapi.com",
        keyHint: "HubSpot Private App Token",
      },
      {
        id: "salesforce",
        label: "Salesforce",
        description: "Enterprise-CRM mit OAuth2 / REST.",
        endpointHint: "https://konzern.my.salesforce.com",
        keyHint: "Salesforce Token",
      },
      {
        id: "pipedrive",
        label: "Pipedrive",
        description: "Pipeline-fokussiertes CRM.",
        endpointHint: "https://api.pipedrive.com/v1",
        keyHint: "Pipedrive API Token",
      },
    ],
  },
  other: {
    label: "Weitere Systeme",
    description: "Eigene Integrationen — z. B. Ticket-Systeme, HR, Intralogistik.",
    icon: Plug,
    providers: [
      {
        id: "webhook",
        label: "Generischer Webhook",
        description: "AxonCore ruft einen Webhook auf.",
        endpointHint: "https://konzern.de/webhook/axon",
        keyHint: "Secret",
      },
      {
        id: "custom",
        label: "Custom Integration",
        description: "Beliebiges externes System.",
        endpointHint: "https://api.system.de",
        keyHint: "API Token",
      },
    ],
  },
};

const STATUS_META: Record<
  Status,
  { label: string; dot: string; className: string }
> = {
  connected: {
    label: "Verbunden",
    dot: "bg-emerald-400",
    className: "border-emerald-400/35 bg-emerald-500/10 text-emerald-100",
  },
  paused: {
    label: "Pausiert",
    dot: "bg-amber-400",
    className: "border-amber-400/35 bg-amber-500/10 text-amber-100",
  },
  error: {
    label: "Fehler",
    dot: "bg-red-400",
    className: "border-red-400/35 bg-red-500/10 text-red-100",
  },
};

const CATEGORIES: Category[] = ["accounting", "machines", "crm", "other"];

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ConnectState = {
  category: Category;
  providerId: string;
} | null;

export default function DashboardApiPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [connect, setConnect] = useState<ConnectState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Category>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/dashboard/integrations", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await resp.json()) as {
        items?: Integration[];
        error?: string;
        migration_required?: boolean;
      };
      if (!resp.ok) {
        setError(payload.error ?? "Integrationen konnten nicht geladen werden.");
        return;
      }
      setItems(payload.items ?? []);
      setMigrationMissing(Boolean(payload.migration_required));
    } catch {
      setError("Netzwerkfehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<Category, Integration[]>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const it of items) {
      const bucket = map.get(it.category) ?? [];
      bucket.push(it);
      map.set(it.category, bucket);
    }
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.category === filter);
  }, [items, filter]);

  const stats = useMemo(() => {
    const connected = items.filter((i) => i.status === "connected").length;
    const paused = items.filter((i) => i.status === "paused").length;
    const errored = items.filter((i) => i.status === "error").length;
    return { total: items.length, connected, paused, errored };
  }, [items]);

  const onToggleStatus = async (row: Integration) => {
    setBusyId(row.id);
    try {
      const next: Status = row.status === "connected" ? "paused" : "connected";
      const resp = await fetch(`/api/dashboard/integrations/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!resp.ok) {
        const p = (await resp.json()) as { error?: string };
        setError(p.error ?? "Status konnte nicht geändert werden.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const onSync = async (row: Integration) => {
    setBusyId(row.id);
    try {
      const resp = await fetch(`/api/dashboard/integrations/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last_sync_at: new Date().toISOString() }),
      });
      if (!resp.ok) {
        const p = (await resp.json()) as { error?: string };
        setError(p.error ?? "Sync fehlgeschlagen.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (row: Integration) => {
    if (!confirm(`Integration „${row.display_name ?? row.provider}“ entfernen?`))
      return;
    setBusyId(row.id);
    try {
      const resp = await fetch(`/api/dashboard/integrations/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!resp.ok) {
        const p = (await resp.json()) as { error?: string };
        setError(p.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="w-full">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.18em] text-[#e4e4e4]">
            API &amp; Integrationen
          </h1>
          <p className="mt-2 text-sm text-[#8a8a8a]">
            Koppelt Buchhaltungs-Systeme, Maschinen-APIs und CRMs mit AxonCore.
            Ohne Kopplung übernimmt die KI die Status-Analyse automatisch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-[#1f1f1f] bg-[#0a0a0a] px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#d4d4d4] transition hover:border-[#2a2a2a] hover:shadow-[0_0_22px_rgba(212,175,55,0.10)] disabled:opacity-50"
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            Aktualisieren
          </button>
        </div>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Aktive Integrationen"
          value={stats.connected}
          icon={CheckCircle2}
          accent="emerald"
        />
        <StatCard
          label="Pausiert"
          value={stats.paused}
          icon={Radio}
          accent="amber"
        />
        <StatCard
          label="Fehler"
          value={stats.errored}
          icon={Activity}
          accent="red"
        />
        <StatCard
          label="Gesamt"
          value={stats.total}
          icon={Plug}
          accent="gold"
        />
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {migrationMissing ? (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Migration <code className="font-mono">integrations</code> ist in
          Produktion noch nicht aktiv. Bitte{" "}
          <code className="font-mono">supabase db push</code> ausführen.
        </div>
      ) : null}

      <div className="mb-8 flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "Alle Kategorien" },
            { id: "accounting", label: "Buchhaltung" },
            { id: "machines", label: "Maschinen" },
            { id: "crm", label: "CRM" },
            { id: "other", label: "Weitere" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-4 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] transition ${
              filter === f.id
                ? "border-[#c9a962]/55 bg-[#c9a962]/12 text-[#e8dcb8]"
                : "border-[#1f1f1f] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#2a2a2a] hover:text-[#d4d4d4]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-[#d4d4d4]">
            Verfügbare Provider
          </h2>
          <p className="text-xs text-[#8a8a8a]">
            Klickt auf „Verbinden“, um einen Provider hinzuzufügen.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
          {CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            return (
              <div
                key={cat}
                className="rounded-2xl border border-[#1f1f1f] bg-[#0a0a0a] p-5"
              >
                <div className="mb-4 flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#c9a962]/30 bg-[#c9a962]/10">
                    <Icon
                      className="size-5 text-[#c9a962]"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </span>
                  <div>
                    <h3 className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-[#e4e4e4]">
                      {meta.label}
                    </h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#8a8a8a]">
                      {meta.description}
                    </p>
                  </div>
                </div>

                <ul className="space-y-2">
                  {meta.providers.map((prov) => {
                    const active = (grouped.get(cat) ?? []).some(
                      (i) => i.provider === prov.id,
                    );
                    return (
                      <li key={prov.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-[#d4d4d4]">
                            {prov.label}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-[10px] text-[#8a8a8a]">
                            {prov.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setConnect({ category: cat, providerId: prov.id })
                          }
                          className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.14em] transition ${
                            active
                              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                              : "border-[#c9a962]/30 bg-[#c9a962]/5 text-[#d4c896] hover:border-[#c9a962]/55 hover:bg-[#c9a962]/12"
                          }`}
                        >
                          {active ? "Aktiv" : (
                            <span className="inline-flex items-center gap-1">
                              <Plus className="size-3" strokeWidth={2} /> Verbinden
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-[#d4d4d4]">
            Aktive Kopplungen
          </h2>
          <span className="text-xs text-[#8a8a8a]">
            {filteredItems.length} Eintrag{filteredItems.length === 1 ? "" : "e"}
          </span>
        </div>

        {loading && items.length === 0 ? (
          <p className="text-sm text-[#8a8a8a]">Lädt…</p>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#1f1f1f] bg-[#050505] p-10 text-center">
            <Building2
              className="mx-auto mb-3 size-6 text-[#3a3a3a]"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a8a8a]">
              Noch keine Integration aktiv
            </p>
            <p className="mt-2 text-xs text-[#6a6a6a]">
              Wählt oben einen Provider, um eine Verbindung zu AxonCore aufzubauen.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredItems.map((row) => {
              const catMeta = CATEGORY_META[row.category];
              const statusMeta = STATUS_META[row.status];
              const provider =
                catMeta.providers.find((p) => p.id === row.provider) ?? null;
              return (
                <article
                  key={row.id}
                  className="rounded-2xl border border-[#1f1f1f] bg-[#0a0a0a] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                        {catMeta.label}
                      </p>
                      <h3 className="mt-1 truncate text-[15px] font-semibold text-[#e4e4e4]">
                        {row.display_name ?? provider?.label ?? row.provider}
                      </h3>
                    </div>
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.16em] ${statusMeta.className}`}
                    >
                      <span
                        className={`inline-block size-1.5 rounded-full ${statusMeta.dot}`}
                      />
                      {statusMeta.label}
                    </span>
                  </div>

                  <dl className="mt-4 space-y-2 text-xs">
                    <Detail label="Provider" value={provider?.label ?? row.provider} />
                    <Detail
                      label="Endpoint"
                      value={
                        <span className="break-all font-mono text-[11px] text-[#d4d4d4]">
                          {row.api_endpoint ?? "—"}
                        </span>
                      }
                    />
                    <Detail
                      label="API Key"
                      value={
                        <span className="font-mono text-[11px] text-[#d4d4d4]">
                          {row.api_key_hint ?? "nicht hinterlegt"}
                        </span>
                      }
                    />
                    <Detail
                      label="Letzter Sync"
                      value={formatTimestamp(row.last_sync_at)}
                    />
                    {row.notes ? (
                      <Detail label="Notiz" value={row.notes} />
                    ) : null}
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onSync(row)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#1f1f1f] bg-[#050505] px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4d4d4] transition hover:border-[#2a2a2a] disabled:opacity-50"
                    >
                      <RefreshCw className="size-3" strokeWidth={1.5} />
                      Sync
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onToggleStatus(row)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#c9a962]/30 bg-[#c9a962]/[0.05] px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896] transition hover:border-[#c9a962]/55 hover:bg-[#c9a962]/10 disabled:opacity-50"
                    >
                      {row.status === "connected" ? "Pausieren" : "Aktivieren"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onDelete(row)}
                      className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/[0.05] px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-red-200 transition hover:border-red-400/55 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Trash2 className="size-3" strokeWidth={1.5} />
                      Trennen
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {connect ? (
        <ConnectDialog
          state={connect}
          onClose={() => setConnect(null)}
          onSaved={async () => {
            setConnect(null);
            await load();
          }}
        />
      ) : null}
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Database;
  accent: "emerald" | "amber" | "red" | "gold";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
        ? "text-amber-300"
        : accent === "red"
          ? "text-red-300"
          : "text-[#d4c896]";
  return (
    <div className="rounded-2xl border border-[#1f1f1f] bg-[#0a0a0a] p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
          {label}
        </p>
        <Icon className={`size-4 ${color}`} strokeWidth={1.5} aria-hidden />
      </div>
      <p className={`mt-2 font-mono text-[26px] font-semibold ${color}`}>
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6a6a6a]">
        {label}
      </dt>
      <dd className="text-right text-[12px] text-[#d4d4d4]">{value}</dd>
    </div>
  );
}

function ConnectDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { category: Category; providerId: string };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const meta = CATEGORY_META[state.category];
  const provider =
    meta.providers.find((p) => p.id === state.providerId) ?? meta.providers[0];

  const [displayName, setDisplayName] = useState(provider.label);
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/api/dashboard/integrations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: state.category,
          provider: provider.id,
          display_name: displayName,
          api_endpoint: endpoint,
          api_key: apiKey,
          notes,
        }),
      });
      const payload = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(payload.error ?? "Kopplung fehlgeschlagen.");
        return;
      }
      await onSaved();
    } catch {
      setError("Netzwerkfehler beim Speichern.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[#1f1f1f] bg-[#0a0a0a] p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
              {meta.label}
            </p>
            <h3 className="mt-1 text-[17px] font-semibold text-[#e4e4e4]">
              {provider.label} verbinden
            </h3>
            <p className="mt-1 text-xs text-[#8a8a8a]">{provider.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-full border border-[#1f1f1f] bg-[#050505] text-[#d4d4d4] transition hover:border-[#2a2a2a]"
            aria-label="Schließen"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Anzeigename">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              className="w-full rounded-lg border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e4e4e4] outline-none focus:border-[#c9a962]/55"
            />
          </Field>
          <Field label={`Endpoint (${provider.endpointHint})`}>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={provider.endpointHint}
              maxLength={400}
              className="w-full rounded-lg border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e4e4e4] outline-none focus:border-[#c9a962]/55"
            />
          </Field>
          <Field label={`API Key / Token (${provider.keyHint})`}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••"
              maxLength={400}
              className="w-full rounded-lg border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e4e4e4] outline-none focus:border-[#c9a962]/55"
            />
            <p className="mt-1 text-[10px] text-[#6a6a6a]">
              AxonCore speichert nur einen maskierten Hinweis zur Wiedererkennung.
            </p>
          </Field>
          <Field label="Notiz (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={600}
              className="w-full resize-none rounded-lg border border-[#1f1f1f] bg-[#050505] px-3 py-2 text-[12px] text-[#e4e4e4] outline-none focus:border-[#c9a962]/55"
            />
          </Field>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#1f1f1f] bg-[#050505] px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#8a8a8a] transition hover:text-[#d4d4d4]"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full border border-[#c9a962]/55 bg-[#c9a962]/12 px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#e8dcb8] transition hover:bg-[#c9a962]/20 disabled:opacity-50"
          >
            {submitting ? "Verbinde…" : "Jetzt verbinden"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
        {label}
      </span>
      {children}
    </label>
  );
}
