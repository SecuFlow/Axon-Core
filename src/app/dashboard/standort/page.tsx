"use client";

import { Suspense, FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { sanitizeBrandName } from "@/lib/brandTheme";

type LocationRow = {
  id: string;
  created_at: string;
  company_id: string;
  name: string;
  address: string | null;
};

type CompanyOption = { id: string; name: string; tenant_id: string };

function filterStandortCompanies(
  rows: { id: string; name: string; tenant_id: string | null }[],
): CompanyOption[] {
  const looksLikeEmail = (raw: string) => {
    const s = raw.trim();
    if (!s.includes("@")) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  };
  return rows
    .filter(
      (c) =>
        typeof c.tenant_id === "string" &&
        c.tenant_id.trim().length > 0 &&
        !looksLikeEmail(c.name),
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      tenant_id: c.tenant_id as string,
    }));
}

const INFO_EMPTY_KONZERN =
  "Wähle eine Organisation aus, um deren Standorte zu sehen, oder lege den ersten Standort an.";

type LocationsPayload = {
  error?: string;
  error_tone?: string;
  locations?: LocationRow[];
  can_manage_locations?: boolean;
  company_role?: string;
  default_company_id?: string | null;
  is_admin?: boolean;
  profile_role?: string;
  mandate_company_name?: string | null;
  profile_company_id?: string | null;
  mandant_switcher_eligible?: boolean;
};

function StandortPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [infoHint, setInfoHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [companyRole, setCompanyRole] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [mandateCompanyName, setMandateCompanyName] = useState<string | null>(
    null,
  );
  const [profileCompanyPk, setProfileCompanyPk] = useState<string | null>(null);
  const [mandantSwitcherEligible, setMandantSwitcherEligible] = useState(false);
  const [standortInitDone, setStandortInitDone] = useState(false);
  const [scopeTenantId, setScopeTenantId] = useState("");
  const [defaultCompanyIdFromApi, setDefaultCompanyIdFromApi] = useState<
    string | null
  >(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(
    null,
  );

  const [adminMode, setAdminMode] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [scopeId, setScopeId] = useState("");

  const isManagerProfile = profileRole === "manager";
  const showMandantPicker =
    adminMode && mandantSwitcherEligible && !isManagerProfile;
  const roleNorm = profileRole.trim().toLowerCase() || companyRole.trim().toLowerCase();
  const mayAddLocation =
    isAdminUser ||
    canManage ||
    roleNorm === "manager" ||
    roleNorm === "admin";
  const hasCompanyScope =
    !showMandantPicker || (Boolean(scopeId) && Boolean(scopeTenantId));
  const showAddForm = hasCompanyScope && mayAddLocation;
  const mayDeleteLocation =
    isAdminUser ||
    roleNorm === "manager" ||
    roleNorm === "admin";

  function applyLocationsPayload(p: LocationsPayload, respOk: boolean) {
    const adminFlag = p.is_admin === true;
    const tone = p.error_tone === "info" ? "info" : "error";
    if (!respOk) {
      const msg = p.error ?? "Konnte Standorte nicht laden.";
      const friendly =
        msg.includes("Unbekannter Konzern") || msg.includes("Mandanten")
          ? INFO_EMPTY_KONZERN
          : msg;
      if (adminFlag && tone === "info") {
        setError(null);
        setInfoHint(friendly);
      } else {
        setInfoHint(null);
        setError(friendly);
      }
      setLocations([]);
      setCanManage(p.can_manage_locations === true);
      setIsAdminUser(adminFlag);
      setCompanyRole(typeof p.company_role === "string" ? p.company_role : "");
      setProfileRole(
        typeof p.profile_role === "string" ? p.profile_role : "",
      );
      setMandateCompanyName(
        sanitizeBrandName(
          typeof p.mandate_company_name === "string"
            ? p.mandate_company_name
            : null,
        ),
      );
      setProfileCompanyPk(
        typeof p.profile_company_id === "string" && p.profile_company_id
          ? p.profile_company_id
          : null,
      );
      setMandantSwitcherEligible(p.mandant_switcher_eligible === true);
      setDefaultCompanyIdFromApi(
        typeof p.default_company_id === "string" && p.default_company_id
          ? p.default_company_id
          : null,
      );
      return;
    }
    setError(null);
    setInfoHint(null);
    setLocations(p.locations ?? []);
    setCanManage(p.can_manage_locations === true);
    setIsAdminUser(adminFlag);
    setCompanyRole(typeof p.company_role === "string" ? p.company_role : "");
    setProfileRole(
      typeof p.profile_role === "string" ? p.profile_role : "",
    );
    setMandateCompanyName(
      sanitizeBrandName(
        typeof p.mandate_company_name === "string"
          ? p.mandate_company_name
          : null,
      ),
    );
    setProfileCompanyPk(
      typeof p.profile_company_id === "string" && p.profile_company_id
        ? p.profile_company_id
        : null,
    );
    setMandantSwitcherEligible(p.mandant_switcher_eligible === true);
    setDefaultCompanyIdFromApi(
      typeof p.default_company_id === "string" && p.default_company_id
        ? p.default_company_id
        : null,
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setInfoHint(null);
      try {
        const locResp = await fetch("/api/dashboard/locations", {
          credentials: "include",
          cache: "no-store",
        });
        const p = (await locResp.json()) as LocationsPayload;
        if (cancelled) return;
        applyLocationsPayload(p, locResp.ok);

        const switcher = p.mandant_switcher_eligible === true;
        if (switcher) {
          const rc = await fetch("/api/dashboard/team/companies", {
            credentials: "include",
            cache: "no-store",
          });
          if (cancelled) return;
          if (rc.ok) {
            const pc = (await rc.json()) as {
              companies?: { id: string; name: string; tenant_id: string | null }[];
            };
            setCompanies(filterStandortCompanies(pc.companies ?? []));
            setAdminMode(true);
          } else {
            setCompanies([]);
            setAdminMode(false);
          }
        } else {
          setCompanies([]);
          setAdminMode(false);
        }
      } catch {
        if (!cancelled) setError("Netzwerkfehler.");
      } finally {
        if (!cancelled) {
          setStandortInitDone(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isManagerProfile || !profileCompanyPk) return;
    const fromUrl = searchParams.get("company_id")?.trim() ?? "";
    if (!fromUrl || fromUrl === profileCompanyPk) return;
    router.replace("/dashboard/standort", { scroll: false });
  }, [isManagerProfile, profileCompanyPk, router, searchParams]);

  useEffect(() => {
    if (!showMandantPicker || companies.length === 0) return;
    const fromUrl = searchParams.get("company_id")?.trim() ?? "";
    const validUrl =
      fromUrl && companies.some((c) => c.id === fromUrl) ? fromUrl : "";
    if (validUrl) {
      setScopeId(validUrl);
      const row = companies.find((c) => c.id === validUrl);
      if (row?.tenant_id) setScopeTenantId(row.tenant_id);
      return;
    }
    if (fromUrl) return;
    const preferred =
      defaultCompanyIdFromApi &&
      companies.some((c) => c.id === defaultCompanyIdFromApi)
        ? defaultCompanyIdFromApi
        : companies[0]?.id ?? "";
    if (preferred) {
      setScopeId((s) => s || preferred);
      const row = companies.find((c) => c.id === preferred);
      if (row?.tenant_id) setScopeTenantId(row.tenant_id);
    }
  }, [showMandantPicker, companies, searchParams, defaultCompanyIdFromApi]);

  const setMandantAndUrl = (id: string) => {
    setScopeId(id);
    const row = companies.find((c) => c.id === id);
    setScopeTenantId(row?.tenant_id ?? "");
    const next = new URLSearchParams(searchParams.toString());
    if (id) next.set("company_id", id);
    else next.delete("company_id");
    const q = next.toString();
    router.replace(q ? `/dashboard/standort?${q}` : "/dashboard/standort", {
      scroll: false,
    });
  };

  const load = useCallback(async () => {
    if (!standortInitDone) return;
    setLoading(true);
    setError(null);
    setInfoHint(null);
    try {
      const qs =
        showMandantPicker && scopeId
          ? `?company_id=${encodeURIComponent(scopeId)}`
          : "";
      const resp = await fetch(`/api/dashboard/locations${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const p = (await resp.json()) as LocationsPayload;
      applyLocationsPayload(p, resp.ok);
    } finally {
      setLoading(false);
    }
  }, [standortInitDone, showMandantPicker, scopeId]);

  useEffect(() => {
    if (!standortInitDone) return;
    if (!showMandantPicker) return;
    if (!scopeId || companies.length === 0) return;
    void load();
  }, [load, standortInitDone, showMandantPicker, companies.length, scopeId]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || saving || !mayAddLocation || !hasCompanyScope) return;
    if (showMandantPicker && (!scopeId || !scopeTenantId)) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const qs =
        showMandantPicker && scopeId
          ? `?company_id=${encodeURIComponent(scopeId)}`
          : "";
      const resp = await fetch(`/api/dashboard/locations${qs}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          address: address.trim() || undefined,
          ...(showMandantPicker && scopeId ? { company_id: scopeId } : {}),
          ...(showMandantPicker && scopeTenantId
            ? { tenant_id: scopeTenantId }
            : {}),
        }),
      });
      const p = (await resp.json()) as {
        error?: string;
        error_tone?: string;
        is_admin?: boolean;
      };
      if (!resp.ok) {
        const msg = p.error ?? "Speichern fehlgeschlagen.";
        if (p.error_tone === "info" && p.is_admin === true) {
          setError(null);
          setInfoHint(
            msg.includes("Unbekannter") ? INFO_EMPTY_KONZERN : msg,
          );
        } else {
          setInfoHint(null);
          setError(msg);
        }
        return;
      }
      setInfoHint(null);
      setName("");
      setAddress("");
      setSuccessMessage("Standort wurde gespeichert.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deleteLocation = async (loc: LocationRow) => {
    if (!mayDeleteLocation) return;
    if (
      !window.confirm(
        `Standort „${loc.name}“ unwiderruflich löschen?`,
      )
    ) {
      return;
    }
    setDeletingLocationId(loc.id);
    setError(null);
    try {
      const resp = await fetch(
        `/api/dashboard/locations/${encodeURIComponent(loc.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      await load();
    } finally {
      setDeletingLocationId(null);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Standort</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        Erfassen Sie Ihre Werke und Standorte. Diese können später Maschinen
        zugeordnet werden.
      </p>

      {isManagerProfile ? (
        <p className="mt-6 rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Konzern: </span>
          {mandateCompanyName ?? "—"}
        </p>
      ) : null}

      {showMandantPicker ? (
        <div className="mt-6 max-w-lg space-y-2">
          <label
            className="mb-1 block text-xs font-semibold tracking-wide text-slate-500"
            htmlFor="standort-mandant"
          >
            Organisation (Admin):
          </label>
          <select
            id="standort-mandant"
            value={scopeId}
            onChange={(e) => setMandantAndUrl(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/50"
          >
            {companies.length === 0 ? (
              <option value="">Keine Firmen geladen</option>
            ) : (
              companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          <p className="text-xs text-slate-500">
            Wähle die Organisation, für die du Standorte verwalten möchtest.
          </p>
        </div>
      ) : null}

      {infoHint ? (
        <div className="mt-6 rounded-xl border border-slate-600/50 bg-slate-900/60 p-4 text-sm text-slate-300">
          {infoHint}
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      {showAddForm ? (
        <form
          onSubmit={onSubmit}
          className="mt-8 max-w-lg space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Name des Werks
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/50"
              placeholder="z. B. Werk Nord"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Adresse (optional)
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/50"
              placeholder="Straße, PLZ Ort"
            />
          </div>
          <button
            type="submit"
            disabled={
              saving ||
              !name.trim() ||
              !mayAddLocation ||
              (showMandantPicker && (!scopeId || !scopeTenantId))
            }
            className="rounded-full border border-primary/50 bg-primary/20 px-6 py-2 text-sm font-semibold text-white hover:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Wird gespeichert…" : "Standort hinzufügen"}
          </button>
        </form>
      ) : null}

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white">Ihre Standorte</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Lade…</p>
        ) : locations.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            {showMandantPicker
              ? "Noch keine Standorte für diese Organisation — lege den ersten an."
              : "Noch keine Einträge."}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {locations.map((loc) => (
              <li
                key={loc.id}
                className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-100">{loc.name}</p>
                  {loc.address ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">
                      {loc.address}
                    </p>
                  ) : null}
                </div>
                {mayDeleteLocation ? (
                  <button
                    type="button"
                    title="Standort löschen"
                    aria-label={`Standort ${loc.name} löschen`}
                    disabled={deletingLocationId === loc.id}
                    onClick={() => void deleteLocation(loc)}
                    className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-500 transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-300 disabled:opacity-40"
                  >
                    <Trash2 className="size-4" strokeWidth={1.5} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function StandortPage() {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-slate-500">Standort wird geladen…</div>
      }
    >
      <StandortPageContent />
    </Suspense>
  );
}
