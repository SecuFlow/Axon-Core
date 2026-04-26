"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, QrCode, X } from "lucide-react";
import { toast } from "sonner";

type AdminCompanyRow = {
  id: string;
  tenant_id: string | null;
  name: string;
  brand_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  branche: string | null;
  show_cta: boolean;
  demo_slug: string | null;
  is_demo_active: boolean;
  manager_verknuepft: boolean;
};

/** Aus Firmennamen, falls noch kein Slug gesetzt ist (nur Kleinbuchstaben, Zahlen, Bindestrich). */
function suggestDemoSlug(name: string, id: string): string {
  const stripped = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (stripped.length >= 2) return stripped;
  const short = id.replace(/-/g, "").slice(0, 12);
  return `demo-${short}`;
}

export function DemoManagementCenter() {
  const [rows, setRows] = useState<AdminCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrSlug, setQrSlug] = useState<string>("");
  const [qrCompanyId, setQrCompanyId] = useState<string | null>(null);
  const [tempLinkBusyId, setTempLinkBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/companies", { credentials: "include" });
      const j = (await r.json()) as { companies?: AdminCompanyRow[]; error?: string };
      if (!r.ok) {
        toast.error(j.error ?? "Liste konnte nicht geladen werden.");
        setRows([]);
        return;
      }
      setRows(j.companies ?? []);
    } catch {
      toast.error("Netzwerkfehler.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const konzernDemoUrl = useMemo(() => {
    if (!qrOpen || !qrSlug || typeof window === "undefined") return "";
    const u = new URL("/dashboard/konzern", window.location.origin);
    u.searchParams.set("demo", qrSlug);
    return u.toString();
  }, [qrOpen, qrSlug]);

  const workerDemoUrl = useMemo(() => {
    if (!qrOpen || !qrSlug || typeof window === "undefined") return "";
    const u = new URL("/worker", window.location.origin);
    u.searchParams.set("demo", qrSlug);
    return u.toString();
  }, [qrOpen, qrSlug]);

  const updateCompany = async (id: string, patch: Record<string, unknown>) => {
    setSavingId(id);
    try {
      const r = await fetch(`/api/admin/companies/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        toast.error(j.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      toast.success("Gespeichert.");
      await load();
    } catch {
      toast.error("Netzwerkfehler.");
    } finally {
      setSavingId(null);
    }
  };

  const openQrForCompany = async (c: AdminCompanyRow) => {
    let s = (c.demo_slug ?? "").trim().toLowerCase();
    if (!s) {
      s = suggestDemoSlug(c.name, c.id);
      setSavingId(c.id);
      try {
        const r = await fetch(`/api/admin/companies/${encodeURIComponent(c.id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ demo_slug: s }),
        });
        const j = (await r.json()) as { error?: string };
        if (!r.ok) {
          toast.error(
            j.error ??
              "Slug konnte nicht gespeichert werden (z. B. bereits vergeben). Bitte manuell setzen.",
          );
          return;
        }
        toast.success(`Demo-Slug automatisch gesetzt: ${s}`);
        await load();
      } catch {
        toast.error("Netzwerkfehler.");
        return;
      } finally {
        setSavingId(null);
      }
    }
    setQrSlug(s);
    setQrCompanyId(c.id);
    setQrOpen(true);
  };

  const createTemporaryDemoLink = async (companyId: string) => {
    setTempLinkBusyId(companyId);
    try {
      const r = await fetch("/api/admin/demo-links", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, expires_hours: 24 }),
      });
      const j = (await r.json()) as {
        error?: string;
        demo_link?: string;
        expires_at?: string;
      };
      if (!r.ok || !j.demo_link) {
        toast.error(j.error ?? "Temporärer Demo-Link konnte nicht erstellt werden.");
        return;
      }
      try {
        await navigator.clipboard.writeText(j.demo_link);
        const until = j.expires_at ? new Date(j.expires_at).toLocaleString("de-DE") : "";
        toast.success(
          until
            ? `Temporärer Link kopiert (gültig bis ${until}).`
            : "Temporärer Link kopiert.",
        );
      } catch {
        toast.success(`Temporärer Demo-Link erstellt: ${j.demo_link}`);
      }
    } catch {
      toast.error("Netzwerkfehler beim Erstellen des temporären Links.");
    } finally {
      setTempLinkBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-[#c9a962]">
          Demo-Management-Center
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[#7a7a7a]">
          Pro Organisation: Demo‑CTA steuern und Zugang via QR‑Code bereitstellen. Ohne Kennung wird
          beim Öffnen des QR‑Dialogs automatisch ein Vorschlag aus dem Namen erzeugt und gespeichert.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-[#1f1f1f] bg-[#0a0a0a]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-[#6b6b6b]">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              <span className="font-mono text-xs uppercase tracking-widest">Lade Konzerne …</span>
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-sm text-[#6b6b6b]">Keine Firmen gefunden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#1f1f1f] font-mono text-[10px] uppercase tracking-[0.18em] text-[#5c5c5c]">
                    <th className="px-4 py-3">Vorschau</th>
                    <th className="px-4 py-3">Firma</th>
                    <th className="px-4 py-3">Demo-CTA anzeigen</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">QR</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const hex =
                      typeof c.primary_color === "string" && c.primary_color.trim()
                        ? c.primary_color.trim()
                        : "#333333";
                    return (
                      <tr key={c.id} className="border-b border-[#141414] hover:bg-[#101010]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="size-10 shrink-0 overflow-hidden rounded-md border border-[#262626] bg-[#050505]"
                              style={{ backgroundColor: `${hex}22` }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={c.logo_url || "/default-logo.svg"}
                                alt=""
                                className="size-10 object-contain p-1"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div
                              className="h-8 w-8 shrink-0 rounded border border-white/10"
                              style={{ backgroundColor: hex }}
                              title={hex}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#d4d4d4]">{c.name}</div>
                          {c.brand_name && c.brand_name !== c.name ? (
                            <div className="mt-0.5 text-xs text-[#6b6b6b]">{c.brand_name}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <label className="flex items-center gap-2 text-xs text-[#9a9a9a]">
                            <input
                              type="checkbox"
                              className="accent-[#c9a962]"
                              checked={c.show_cta}
                              disabled={savingId === c.id}
                              onChange={(e) =>
                                void updateCompany(c.id, { show_cta: e.target.checked })
                              }
                            />
                            <span>{c.show_cta ? "An" : "Aus"}</span>
                            {savingId === c.id ? (
                              <Loader2 className="size-3.5 animate-spin opacity-60" aria-hidden />
                            ) : null}
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <SlugEditor
                            value={c.demo_slug}
                            disabled={savingId === c.id}
                            onSave={async (next) => {
                              await updateCompany(c.id, { demo_slug: next });
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded border border-[#2a2a2a] bg-[#111] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#c9c9c9] transition hover:border-[#c9a962]/40 hover:text-[#eaeaea]"
                              onClick={() => void openQrForCompany(c)}
                            >
                              <QrCode className="size-3.5" strokeWidth={1.5} aria-hidden />
                              QR-Code
                            </button>
                            <button
                              type="button"
                              disabled={tempLinkBusyId === c.id}
                              onClick={() => void createTemporaryDemoLink(c.id)}
                              className="inline-flex items-center gap-2 rounded border border-[#2a2a2a] bg-[#111] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#8ad0ff] transition hover:border-[#4caee8]/40 hover:text-[#c9ecff] disabled:opacity-60"
                            >
                              {tempLinkBusyId === c.id ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              ) : null}
                              Temp-Link
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <QrModal
        open={qrOpen}
        slug={qrSlug}
        konzernUrl={konzernDemoUrl}
        workerUrl={workerDemoUrl}
        companyId={qrCompanyId}
        onClose={() => {
          setQrOpen(false);
          setQrSlug("");
          setQrCompanyId(null);
        }}
        onDemoActivated={() => void load()}
      />
    </div>
  );
}

function SlugEditor(props: {
  value: string | null;
  disabled: boolean;
  onSave: (next: string | null) => Promise<void> | void;
}) {
  const { value, disabled, onSave } = props;
  const [draft, setDraft] = useState(value ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const normalized = (draft ?? "").trim().toLowerCase();
  const valid =
    normalized.length === 0 || /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$/.test(normalized);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) {
      toast.error("Ungültiger Slug (nur a-z, 0-9 und '-').");
      return;
    }
    setPending(true);
    try {
      await onSave(normalized.length > 0 ? normalized : null);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={draft}
        disabled={disabled || pending}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="siemens"
        className="w-40 rounded border border-[#2a2a2a] bg-[#111] px-3 py-1.5 font-mono text-xs text-[#d4d4d4] outline-none focus:border-[#c9a962]/50 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || pending}
        className="rounded border border-[#2a2a2a] bg-[#0f0f0f] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#8a8a8a] transition hover:border-[#c9a962]/40 hover:text-[#eaeaea] disabled:opacity-60"
      >
        {pending ? "…" : "Speichern"}
      </button>
    </form>
  );
}

function QrModal(props: {
  open: boolean;
  slug: string;
  konzernUrl: string;
  workerUrl: string;
  companyId: string | null;
  onClose: () => void;
  onDemoActivated: () => void;
}) {
  const { open, slug, konzernUrl, workerUrl, companyId, onClose, onDemoActivated } =
    props;
  const [copyBusy, setCopyBusy] = useState(false);

  useEffect(() => {
    if (open) setCopyBusy(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-title"
      >
        <div className="flex items-center justify-between border-b border-[#1f1f1f] px-5 py-4">
          <h2
            id="qr-title"
            className="font-mono text-sm font-medium uppercase tracking-[0.14em] text-[#c4c4c4]"
          >
            QR-Code · {slug}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#6b6b6b] transition hover:bg-[#1a1a1a] hover:text-[#c4c4c4]"
            aria-label="Schließen"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#c9a962]">
              Mitarbeiter-App (Worker)
            </p>
            <div className="flex justify-center rounded-lg bg-white p-4">
              <QRCodeSVG value={workerUrl || " "} size={200} level="M" includeMargin />
            </div>
            <div className="mt-2 space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#5a5a5a]">
                /worker?demo=…
              </div>
              <div className="break-all font-mono text-[11px] text-[#9a9a9a]">
                {workerUrl}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#5a5a5a]">
              Konzern-Dashboard
            </p>
            <div className="flex justify-center rounded-lg bg-white p-4">
              <QRCodeSVG value={konzernUrl || " "} size={200} level="M" includeMargin />
            </div>
            <div className="mt-2 space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#5a5a5a]">
                /dashboard/konzern?demo=…
              </div>
              <div className="break-all font-mono text-[11px] text-[#9a9a9a]">
                {konzernUrl}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={copyBusy}
              onClick={() => {
                void (async () => {
                  if (companyId) {
                    setCopyBusy(true);
                    try {
                      const r = await fetch(
                        `/api/admin/companies/${encodeURIComponent(companyId)}`,
                        {
                          method: "PATCH",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ is_demo_active: true }),
                        },
                      );
                      const j = (await r.json()) as { error?: string };
                      if (!r.ok) {
                        toast.error(j.error ?? "Demo konnte nicht aktiviert werden.");
                        return;
                      }
                      onDemoActivated();
                    } catch {
                      toast.error("Netzwerkfehler.");
                      return;
                    } finally {
                      setCopyBusy(false);
                    }
                  }
                  try {
                    await navigator.clipboard.writeText(workerUrl);
                    toast.success(
                      companyId
                        ? "Demo aktiv — Worker-Link kopiert."
                        : "Worker-Link kopiert.",
                    );
                  } catch {
                    toast.error("Zwischenablage nicht verfügbar.");
                  }
                })();
              }}
              className="rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#c9c9c9] transition hover:border-[#c9a962]/40 hover:text-[#eaeaea] disabled:opacity-60"
            >
              {copyBusy ? "…" : "Worker-Link kopieren"}
            </button>
            <button
              type="button"
              disabled={copyBusy}
              onClick={() => {
                void (async () => {
                  if (companyId) {
                    setCopyBusy(true);
                    try {
                      const r = await fetch(
                        `/api/admin/companies/${encodeURIComponent(companyId)}`,
                        {
                          method: "PATCH",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ is_demo_active: true }),
                        },
                      );
                      const j = (await r.json()) as { error?: string };
                      if (!r.ok) {
                        toast.error(j.error ?? "Demo konnte nicht aktiviert werden.");
                        return;
                      }
                      onDemoActivated();
                    } catch {
                      toast.error("Netzwerkfehler.");
                      return;
                    } finally {
                      setCopyBusy(false);
                    }
                  }
                  try {
                    await navigator.clipboard.writeText(konzernUrl);
                    toast.success(
                      companyId
                        ? "Demo aktiv — Konzern-Link kopiert."
                        : "Konzern-Link kopiert.",
                    );
                  } catch {
                    toast.error("Zwischenablage nicht verfügbar.");
                  }
                })();
              }}
              className="rounded border border-[#2a2a2a] bg-[#111] px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#8a8a8a] transition hover:border-[#c9a962]/40 hover:text-[#eaeaea] disabled:opacity-60"
            >
              {copyBusy ? "…" : "Konzern-Link kopieren"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#2a2a2a] bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#8a8a8a] transition hover:border-[#c9a962]/40 hover:text-[#eaeaea]"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
