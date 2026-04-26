"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import {
  EditUserModal,
  type EditableUser,
  type AdminRoleUi,
} from "@/app/admin/hq/(authenticated)/users/EditUserModal";
import { isRealCompanyOption } from "@/lib/filterRealCompanies";

export type TeamViewer = {
  isAdmin: boolean;
  isManagerScope: boolean;
  canAssignCompany: boolean;
  canAssignLocation: boolean;
  canChangeRole: boolean;
};

export type TeamCompanyOption = {
  id: string;
  name: string;
  tenantId: string | null;
};

export type TeamLocationOption = {
  id: string;
  name: string;
  tenantId: string;
};

export type TeamUserRow = {
  userId: string;
  email: string;
  displayName: string;
  roleLabel: string;
  roleValue: AdminRoleUi;
  isSubscribed: boolean;
  companyAccountName: string | null;
  mandateTenantId: string | null;
  tenantAffiliation: string;
  profileTenantId?: string | null;
  locationId: string | null;
  assignedCompanyRowId: string | null;
};

type TeamPayload = {
  actorId?: string;
  viewer?: TeamViewer;
  companyOptions?: TeamCompanyOption[];
  locations?: TeamLocationOption[];
  users?: TeamUserRow[];
  error?: string;
};

type Variant = "dashboard" | "hq";

function teamRowToEditable(u: TeamUserRow): EditableUser {
  return {
    id: u.userId,
    email: u.email,
    name: u.companyAccountName,
    role: u.roleValue,
    is_subscribed: u.isSubscribed,
  };
}

function isEmail(v: string): boolean {
  const t = v.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function ManagerUserModal({
  variant,
  open,
  mode,
  user,
  onClose,
  onSaved,
}: {
  variant: Variant;
  open: boolean;
  mode: "create" | "edit";
  user: TeamUserRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTempPassword(null);
    if (mode === "edit" && user) {
      setEmail(user.email ?? "");
      // Names are derived from auth metadata; we don't have them in row → keep empty (optional).
      setFirstName("");
      setLastName("");
    } else {
      setEmail("");
      setFirstName("");
      setLastName("");
    }
  }, [open, mode, user]);

  if (!open) return null;

  const panel =
    variant === "dashboard"
      ? "w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-xl"
      : "w-full max-w-lg rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-5 shadow-xl";

  const label =
    variant === "dashboard"
      ? "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
      : "mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#5a5a5a]";

  const input =
    variant === "dashboard"
      ? "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/50"
      : "w-full rounded-md border border-[#262626] bg-[#080808] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40";

  const canSubmit =
    mode === "create" ? isEmail(email) : mode === "edit" ? user != null : false;

  const title =
    mode === "create" ? "Mitarbeiter anlegen" : "Mitarbeiter bearbeiten";

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setTempPassword(null);
    try {
      if (mode === "create") {
        const resp = await fetch("/api/dashboard/team", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            first_name: firstName.trim() || undefined,
            last_name: lastName.trim() || undefined,
          }),
        });
        const p = (await resp.json()) as { error?: string; temp_password?: string };
        if (!resp.ok) {
          setError(p.error ?? "Anlegen fehlgeschlagen.");
          return;
        }
        setTempPassword(typeof p.temp_password === "string" ? p.temp_password : null);
        await onSaved();
        return;
      }

      // edit mode
      if (!user) return;
      const resp = await fetch(`/api/dashboard/team/${encodeURIComponent(user.userId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
        }),
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Update fehlgeschlagen.");
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    setTempPassword(null);
    try {
      const resp = await fetch(`/api/dashboard/team/${encodeURIComponent(user.userId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_password: true }),
      });
      const p = (await resp.json()) as { error?: string; temp_password?: string };
      if (!resp.ok) {
        setError(p.error ?? "Passwort-Reset fehlgeschlagen.");
        return;
      }
      setTempPassword(typeof p.temp_password === "string" ? p.temp_password : null);
      await onSaved();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    if (!user || busy) return;
    if (!window.confirm(`Account „${user.displayName}“ wirklich löschen?`)) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/dashboard/team/${encodeURIComponent(user.userId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div className={panel} role="dialog" aria-modal="true" aria-labelledby="mgr-user-title">
        <h2
          id="mgr-user-title"
          className={
            variant === "dashboard"
              ? "text-lg font-semibold text-white"
              : "font-mono text-sm font-medium uppercase tracking-[0.14em] text-[#c4c4c4]"
          }
        >
          {title}
        </h2>

        {mode === "edit" && user ? (
          <p className={variant === "dashboard" ? "mt-1 text-sm text-slate-400" : "mt-2 font-mono text-[10px] text-[#5a5a5a]"}>
            {user.displayName} · {user.email || user.userId.slice(0, 8)}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          <div>
            <label className={label} htmlFor="mgr-email">E-Mail</label>
            <input
              id="mgr-email"
              className={input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mitarbeiter@firma.de"
              disabled={busy}
            />
            {email && !isEmail(email) ? (
              <p className={variant === "dashboard" ? "mt-1 text-xs text-rose-300/90" : "mt-1 font-mono text-[10px] text-red-200/80"}>
                Bitte E-Mail-Format prüfen.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="mgr-first">Vorname (optional)</label>
              <input
                id="mgr-first"
                className={input}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label className={label} htmlFor="mgr-last">Nachname (optional)</label>
              <input
                id="mgr-last"
                className={input}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          {tempPassword ? (
            <div className={variant === "dashboard" ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" : "rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 font-mono text-[10px] text-emerald-100"}>
              Temporäres Passwort: <span className="font-mono font-semibold">{tempPassword}</span>
            </div>
          ) : null}

          {error ? (
            <div className={variant === "dashboard" ? "rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100" : "rounded-md border border-red-500/30 bg-red-500/10 p-3 font-mono text-[10px] text-red-200"}>
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={
              variant === "dashboard"
                ? "rounded-full border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                : "rounded border border-[#333] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a] hover:bg-[#141414] disabled:opacity-50"
            }
          >
            Schließen
          </button>

          <div className="flex flex-wrap gap-2">
            {mode === "edit" && user ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void resetPassword()}
                  className={
                    variant === "dashboard"
                      ? "rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 hover:bg-amber-500/15 disabled:opacity-50"
                      : "rounded border border-amber-500/35 bg-amber-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-200 disabled:opacity-50"
                  }
                >
                  Passwort zurücksetzen
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteUser()}
                  className={
                    variant === "dashboard"
                      ? "rounded-full border border-rose-500/35 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 hover:bg-rose-500/15 disabled:opacity-50"
                      : "rounded border border-red-500/35 bg-red-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-red-200 disabled:opacity-50"
                  }
                >
                  Löschen
                </button>
              </>
            ) : null}

            <button
              type="button"
              disabled={!canSubmit || busy}
              onClick={() => void submit()}
              className={
                variant === "dashboard"
                  ? "rounded-full border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  : "rounded border border-[#c9a962]/40 bg-[#c9a962]/15 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-[#d4c896] disabled:opacity-50"
              }
            >
              {busy ? "Speichere…" : mode === "create" ? "Anlegen" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const selectClass: Record<Variant, string> = {
  dashboard:
    "w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100 outline-none focus:border-primary/50 disabled:opacity-50",
  hq: "w-full rounded-md border border-[#262626] bg-[#080808] px-2 py-2 font-mono text-[10px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40 disabled:opacity-50",
};

type TeamRole = "mitarbeiter" | "manager" | "admin";

function AdminAssignModal({
  variant,
  open,
  user,
  locations,
  onClose,
  onSave,
  saving,
}: {
  variant: Variant;
  open: boolean;
  user: TeamUserRow | null;
  locations: TeamLocationOption[];
  onClose: () => void;
  onSave: (body: {
    assign_company_id: string | null;
    location_id?: string | null;
    role?: TeamRole;
  }) => void | Promise<void>;
  saving: boolean;
}) {
  const [companyId, setCompanyId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [role, setRole] = useState<TeamRole>("mitarbeiter");
  const [fetchedCompanies, setFetchedCompanies] = useState<TeamCompanyOption[]>(
    [],
  );
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [companiesFetchError, setCompaniesFetchError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!open || !user) return;
    setCompanyId(user.assignedCompanyRowId ?? "");
    setLocationId(user.locationId ?? "");
    setRole(user.roleValue);
  }, [open, user]);

  /** Beim Öffnen des Zuweisen-Dialogs: alle Firmen aus `companies` laden */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCompanies(true);
    setCompaniesFetchError(null);
    setFetchedCompanies([]);
    void (async () => {
      try {
        const r = await fetch("/api/dashboard/team/companies", {
          credentials: "include",
          cache: "no-store",
        });
        const p = (await r.json()) as {
          companies?: Array<{
            id: string;
            tenant_id: string | null;
            name: string;
          }>;
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok) {
          setCompaniesFetchError(
            p.error ?? "Konzerne konnten nicht geladen werden.",
          );
          return;
        }
        const list = (p.companies ?? [])
          .map((c) => ({
            id: c.id,
            name: c.name,
            tenantId: c.tenant_id,
          }))
          .filter((c) =>
            isRealCompanyOption({
              name: c.name,
              tenantId: c.tenantId,
            }),
          );
        setFetchedCompanies(list);
      } catch {
        if (!cancelled) setCompaniesFetchError("Netzwerkfehler.");
      } finally {
        if (!cancelled) setLoadingCompanies(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedCompany = useMemo(
    () => fetchedCompanies.find((x) => x.id === companyId),
    [fetchedCompanies, companyId],
  );

  const selectedTenant = useMemo(() => {
    return selectedCompany?.tenantId ?? null;
  }, [selectedCompany]);

  const locFiltered = useMemo(() => {
    if (!selectedTenant) return [];
    return locations.filter((l) => l.tenantId === selectedTenant);
  }, [locations, selectedTenant]);

  useEffect(() => {
    if (!locationId) return;
    if (!locFiltered.some((l) => l.id === locationId)) {
      setLocationId("");
    }
  }, [locFiltered, locationId]);

  if (!open || !user) return null;

  const panel =
    variant === "dashboard"
      ? "w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-xl"
      : "w-full max-w-md rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-5 shadow-xl";

  const label =
    variant === "dashboard"
      ? "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
      : "mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-[#5a5a5a]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-assign-title"
      >
        <h2
          id="team-assign-title"
          className={
            variant === "dashboard"
              ? "text-lg font-semibold text-white"
              : "font-mono text-sm font-medium uppercase tracking-[0.14em] text-[#c4c4c4]"
          }
        >
          Konzern &amp; Standort zuweisen
        </h2>
        <p
          className={
            variant === "dashboard"
              ? "mt-1 text-sm text-slate-400"
              : "mt-2 font-mono text-[10px] leading-relaxed text-[#5a5a5a]"
          }
        >
          {user.displayName} · {user.email || user.userId.slice(0, 8)}
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className={label} htmlFor="tm-company">
              Konzern zuweisen
            </label>
            {loadingCompanies ? (
              <p
                className={
                  variant === "dashboard"
                    ? "text-xs text-slate-500"
                    : "font-mono text-[10px] text-[#6b6b6b]"
                }
              >
                Lade Firmen…
              </p>
            ) : companiesFetchError ? (
              <p
                className={
                  variant === "dashboard"
                    ? "text-xs text-slate-400"
                    : "font-mono text-[10px] text-[#8a8a8a]"
                }
                role="alert"
              >
                {companiesFetchError}
              </p>
            ) : (
              <>
                <select
                  id="tm-company"
                  className={selectClass[variant]}
                  value={companyId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCompaniesFetchError(null);
                    if (next !== companyId) setLocationId("");
                    setCompanyId(next);
                  }}
                  disabled={saving}
                >
                  <option value="">— Mandant wählen —</option>
                  {fetchedCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {companyId && selectedCompany ? (
                  <p
                    className={
                      variant === "dashboard"
                        ? "mt-2 text-xs text-emerald-400/95"
                        : "mt-2 font-mono text-[10px] text-[#9acd8e]"
                    }
                  >
                    Ausgewählt:{" "}
                    <span className="font-medium">{selectedCompany.name}</span>
                  </p>
                ) : null}
                {companyId && selectedCompany && !selectedCompany.tenantId ? (
                  <p
                    className={
                      variant === "dashboard"
                        ? "mt-1 text-[11px] text-slate-500"
                        : "mt-1 font-mono text-[9px] text-[#6b6b6b]"
                    }
                    role="status"
                  >
                    Hinweis: Diese Firma hat keine tenant_id — Standorte können
                    nicht zugeordnet werden.
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div>
            <label className={label} htmlFor="tm-loc">
              Standort zuweisen
            </label>
            <select
              id="tm-loc"
              className={selectClass[variant]}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={saving || !selectedTenant}
            >
              <option value="">— kein Standort —</option>
              {locFiltered.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            {!selectedTenant ? (
              <p
                className={
                  variant === "dashboard"
                    ? "mt-1 text-[11px] text-slate-500"
                    : "mt-1 font-mono text-[9px] text-[#4a4a4a]"
                }
              >
                Zuerst einen Konzern wählen.
              </p>
            ) : null}
          </div>
          <div>
            <label className={label} htmlFor="tm-role">
              Rolle
            </label>
            <select
              id="tm-role"
              className={selectClass[variant]}
              value={role}
              onChange={(e) => setRole(e.target.value as TeamRole)}
              disabled={saving}
            >
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={
              variant === "dashboard"
                ? "rounded-full border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                : "rounded border border-[#333] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a] hover:bg-[#141414] disabled:opacity-50"
            }
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              void (async () => {
                if (!companyId) {
                  await onSave({ assign_company_id: null });
                  return;
                }
                await onSave({
                  assign_company_id: companyId,
                  location_id: locationId.length > 0 ? locationId : null,
                  role,
                });
              })();
            }}
            className={
              variant === "dashboard"
                ? "rounded-full border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                : "rounded border border-[#c9a962]/40 bg-[#c9a962]/15 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-[#d4c896] disabled:opacity-50"
            }
          >
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeamManagementClient({ variant = "dashboard" }: { variant?: Variant }) {
  const [data, setData] = useState<TeamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [modalUser, setModalUser] = useState<TeamUserRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalUser, setEditModalUser] = useState<EditableUser | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [mgrModalOpen, setMgrModalOpen] = useState(false);
  const [mgrModalMode, setMgrModalMode] = useState<"create" | "edit">("create");
  const [mgrModalUser, setMgrModalUser] = useState<TeamUserRow | null>(null);
  const load = useCallback(async () => {
    setListError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/dashboard/team", {
        credentials: "include",
        cache: "no-store",
      });
      const p = (await r.json()) as TeamPayload;
      if (!r.ok) {
        setListError(p.error ?? "Liste konnte nicht geladen werden.");
        setData(null);
        return;
      }
      setListError(null);
      setRowError(null);
      setData(p);
    } catch {
      setListError("Netzwerkfehler.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(
    async (userId: string, body: Record<string, unknown>) => {
      setRowError(null);
      setBusyUserId(userId);
      try {
        const r = await fetch(
          `/api/dashboard/team/${encodeURIComponent(userId)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const p = (await r.json()) as { error?: string };
        if (!r.ok) {
          setRowError(p.error ?? "Aktualisierung fehlgeschlagen.");
          return false;
        }
        setRowError(null);
        await load();
        return true;
      } catch {
        setRowError("Netzwerkfehler.");
        return false;
      } finally {
        setBusyUserId(null);
      }
    },
    [load],
  );

  const viewer = data?.viewer;
  const users = data?.users ?? [];
  const locations = data?.locations ?? [];

  const isAdmin = viewer?.isAdmin === true;
  const hqAdminTable = variant === "hq" && isAdmin;
  const canManageAccounts =
    variant === "dashboard" && (viewer?.isManagerScope === true || isAdmin);
  const colCount = hqAdminTable
    ? 7
    : 4 +
      (isAdmin ? 1 : 0) +
      (!isAdmin && viewer?.canAssignLocation ? 1 : 0) +
      (canManageAccounts ? 1 : 0);

  const tableWrap =
    variant === "dashboard"
      ? "overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40"
      : "overflow-x-auto rounded-lg border border-[#1f1f1f] bg-[#0a0a0a]";

  const th =
    variant === "dashboard"
      ? "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
      : "px-4 py-3 text-left font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-[#5a5a5a]";

  const td =
    variant === "dashboard"
      ? "px-4 py-3 align-middle text-sm text-slate-200"
      : "px-4 py-3 align-middle font-mono text-[11px] text-[#b0b0b0]";

  if (loading && !data) {
    return (
      <p
        className={
          variant === "dashboard"
            ? "text-sm text-slate-500"
            : "font-mono text-[10px] text-[#6b6b6b]"
        }
      >
        Team wird geladen…
      </p>
    );
  }

  if (listError) {
    return (
      <p
        className={
          variant === "dashboard"
            ? "text-sm text-slate-300"
            : "font-mono text-sm text-[#c8c8c8]"
        }
        role="alert"
      >
        {listError}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {canManageAccounts ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setMgrModalMode("create");
              setMgrModalUser(null);
              setMgrModalOpen(true);
            }}
            className={
              variant === "dashboard"
                ? "rounded-full border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-medium text-white hover:bg-primary/20"
                : "rounded border border-[#c9a962]/40 bg-[#c9a962]/15 px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-[#d4c896]"
            }
          >
            + Mitarbeiter anlegen
          </button>
        </div>
      ) : null}

      {rowError ? (
        <p
          className={
            variant === "dashboard"
              ? "rounded-lg border border-slate-600/40 bg-slate-900/50 px-3 py-2 text-sm text-slate-200"
              : "rounded-md border border-[#333] bg-[#0d0d0d] px-3 py-2 font-mono text-[10px] text-[#c8c8c8]"
          }
          role="alert"
        >
          {rowError}
        </p>
      ) : null}

      <div className={tableWrap}>
        <table
          className={`w-full border-collapse text-left ${
            hqAdminTable ? "min-w-[1040px]" : "min-w-[720px]"
          }`}
        >
          <thead>
            <tr
              className={
                variant === "dashboard"
                  ? "border-b border-slate-800"
                  : "border-b border-[#1f1f1f]"
              }
            >
              <th className={th}>Name</th>
              <th className={th}>E-Mail</th>
              <th className={th}>Mandant</th>
              {hqAdminTable ? (
                <>
                  <th className={th}>Abo</th>
                </>
              ) : null}
              <th className={th}>Rolle</th>
              {isAdmin ? <th className={th}>Zuweisung</th> : null}
              {hqAdminTable ? (
                <th className={th}>Bearbeiten</th>
              ) : null}
              {!isAdmin && viewer?.canAssignLocation ? (
                <th className={th}>Standort</th>
              ) : null}
              {canManageAccounts ? <th className={th}>Account</th> : null}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className={
                    variant === "dashboard"
                      ? "px-4 py-8 text-center text-slate-500"
                      : "px-4 py-8 text-center text-[#5a5a5a]"
                  }
                >
                  Keine Einträge
                </td>
              </tr>
            ) : (
              users.map((u, rowIndex) => (
                <tr
                  key={u.userId}
                  className={
                    variant === "dashboard"
                      ? `border-b border-slate-800/50 transition-colors duration-150 ${
                          rowIndex % 2 === 0
                            ? "bg-slate-950/50"
                            : "bg-[#0c1016]/85"
                        } hover:bg-[#00d1ff]/[0.07] hover:shadow-[inset_0_0_0_1px_rgba(0,209,255,0.12)]`
                      : `border-b border-[#141414] transition-colors duration-150 ${
                          rowIndex % 2 === 0 ? "bg-[#070707]" : "bg-[#0a0a0a]"
                        } hover:bg-[#00d1ff]/[0.06] hover:shadow-[inset_0_0_0_1px_rgba(0,209,255,0.1)]`
                  }
                >
                  <td className={td}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{u.displayName}</span>
                    </div>
                  </td>
                  <td className={td}>{u.email || "—"}</td>
                  <td className={td}>
                    <span
                      className={
                        variant === "dashboard"
                          ? "text-slate-300"
                          : "text-[#c8c8c8]"
                      }
                    >
                      {u.tenantAffiliation}
                    </span>
                  </td>
                  {hqAdminTable ? (
                    <td className={td}>
                      {u.isSubscribed ? (
                        <span className="text-emerald-600/90">An</span>
                      ) : (
                        <span className="text-[#5a5a5a]">Aus</span>
                      )}
                    </td>
                  ) : null}
                  <td className={td}>{u.roleLabel}</td>
                  {isAdmin ? (
                    <td className={td}>
                      <button
                        type="button"
                        disabled={busyUserId === u.userId}
                        onClick={() => {
                          setRowError(null);
                          setModalUser(u);
                          setModalOpen(true);
                        }}
                        className={
                          variant === "dashboard"
                            ? "text-xs font-medium text-primary/90 hover:underline disabled:opacity-50"
                            : "font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9a962] hover:underline disabled:opacity-50"
                        }
                      >
                        ZUWEISEN…
                      </button>
                    </td>
                  ) : null}
                  {hqAdminTable ? (
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditModalUser(teamRowToEditable(u));
                          setEditModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded border border-[#2a2a2a] bg-[#111] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#9a9a9a] transition hover:border-[#c9a962]/30 hover:text-[#c9a962]"
                      >
                        <Pencil className="size-3" strokeWidth={1.5} />
                        Bearbeiten
                      </button>
                    </td>
                  ) : null}
                  {!isAdmin && viewer?.canAssignLocation ? (
                    <td className={td}>
                      {/* Manager: vereinfacht — ggf. später Inline-Standort */}
                      <span className="opacity-70">—</span>
                    </td>
                  ) : null}
                  {canManageAccounts ? (
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() => {
                          setMgrModalMode("edit");
                          setMgrModalUser(u);
                          setMgrModalOpen(true);
                        }}
                        className={
                          variant === "dashboard"
                            ? "text-xs font-medium text-primary/90 hover:underline"
                            : "font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9a962] hover:underline"
                        }
                      >
                        Bearbeiten…
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminAssignModal
        variant={variant}
        open={modalOpen}
        user={modalUser}
        locations={locations}
        onClose={() => {
          setModalOpen(false);
          setModalUser(null);
        }}
        saving={busyUserId === modalUser?.userId}
        onSave={async (body) => {
          if (!modalUser) return;
          const ok = await patch(modalUser.userId, body);
          if (ok) {
            setModalOpen(false);
            setModalUser(null);
          }
        }}
      />

      {variant === "hq" ? (
        <EditUserModal
          user={editModalUser}
          open={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditModalUser(null);
          }}
          onSaved={() => void load()}
        />
      ) : null}

      {canManageAccounts ? (
        <ManagerUserModal
          variant={variant}
          open={mgrModalOpen}
          mode={mgrModalMode}
          user={mgrModalUser}
          onClose={() => {
            setMgrModalOpen(false);
            setMgrModalUser(null);
          }}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
