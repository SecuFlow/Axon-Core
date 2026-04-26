"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, Send, Trash2, X } from "lucide-react";

type Lead = {
  id: string;
  company_name: string;
  domain: string | null;
  contact_email?: string | null;
  market_segment: string | null;
  industry: string | null;
  employee_count: number | null;
  revenue_eur: number | null;
  hq_location: string | null;
  lead_segment?: "enterprise" | "smb";
  stage: string;
  next_action_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
  notes?: string | null;
  manager_name?: string | null;
  linkedin_url?: string | null;
  corporate_group_name?: string | null;
  location_name?: string | null;
  phone?: string | null;
  department?: string | null;
  research_source?: string | null;
};

type PipelineStatusKey =
  | "neu"
  | "email_1_gesendet"
  | "follow_up_erfolgt"
  | "demo_angefordert"
  | "abschluss";

const pipelineTabs: Array<{ key: PipelineStatusKey | "alle"; label: string }> = [
  { key: "alle", label: "Alle" },
  { key: "neu", label: "Neu" },
  { key: "email_1_gesendet", label: "Email 1 gesendet" },
  { key: "follow_up_erfolgt", label: "Follow-Up erfolgt" },
  { key: "demo_angefordert", label: "Demo angefordert" },
  { key: "abschluss", label: "Abschluss" },
];

/**
 * Sequenz Tag 1 / 3 / 5 — welche E-Mail (1–3) ist als Nächstes dran bzw. erledigt.
 */
function leadSequenceEmailStep(lead: Lead): {
  /** 1–3 = nächster geplanter Versand in der 3er-Kette; null = Sequenz abgeschlossen */
  nextEmail: 1 | 2 | 3 | null;
  /** Zugehöriger Sequenz-Tag (Kalender) */
  sequenceTag: 1 | 3 | 5 | null;
  label: string;
  csv: string;
} {
  const stage = (lead.stage ?? "").trim().toLowerCase();
  if (stage === "demo_sent" || stage === "replied" || stage === "disqualified") {
    return {
      nextEmail: null,
      sequenceTag: null,
      label: "Alle 3 E-Mails durchlaufen",
      csv: "E-Mail 3 ✓ (Sequenz Ende)",
    };
  }
  if (stage === "follow_up") {
    return {
      nextEmail: 3,
      sequenceTag: 5,
      label: "E-Mail 3 (Demo) — Tag 5",
      csv: "Nächste: E-Mail 3 · Tag 5",
    };
  }
  if (stage === "mail_1") {
    return {
      nextEmail: 2,
      sequenceTag: 3,
      label: "E-Mail 2 (Follow-up) — Tag 3",
      csv: "Nächste: E-Mail 2 · Tag 3",
    };
  }
  return {
    nextEmail: 1,
    sequenceTag: 1,
    label: "E-Mail 1 (Erstkontakt) — Tag 1",
    csv: "Nächste: E-Mail 1 · Tag 1",
  };
}

function pipelineStatus(lead: Lead): { key: PipelineStatusKey; label: string } {
  const stage = (lead.stage ?? "").trim().toLowerCase();
  if (stage === "replied" || stage === "disqualified") {
    return { key: "abschluss", label: "Abschluss" };
  }
  if (stage === "demo_sent") {
    return { key: "demo_angefordert", label: "Demo angefordert" };
  }
  if (stage === "follow_up") {
    return { key: "follow_up_erfolgt", label: "Follow-Up erfolgt" };
  }
  if (stage === "mail_1") {
    return { key: "email_1_gesendet", label: "Email 1 gesendet" };
  }
  return { key: "neu", label: "Neu" };
}

type Payload = { error?: string; leads?: Lead[] };
type LeadDetailsPayload = {
  error?: string;
  lead?: Lead;
  events?: Array<{
    id: string;
    created_at: string;
    event_type: string;
    channel: string;
    status: string;
    metadata: unknown;
  }>;
  messages?: Array<{
    id: string;
    created_at: string;
    message_type: string;
    subject: string | null;
    body: string;
    metadata: unknown;
    sent_at?: string | null;
    to_email?: string | null;
    gmail_message_id?: string | null;
    gmail_thread_id?: string | null;
  }>;
};

type ResearchNotes = {
  lead_id: string;
  summary: string | null;
  pain_points: string | null;
  personalization_hooks: string | null;
  raw_notes: string | null;
  sources: unknown;
  confidence: number | null;
  updated_at: string | null;
};

type ResearchSource = { url: string; title?: string; note?: string };

function asResearchSources(value: unknown): ResearchSource[] {
  if (!Array.isArray(value)) return [];
  const out: ResearchSource[] = [];
  for (const item of value) {
    const it = item as Record<string, unknown> | null;
    const url = typeof it?.url === "string" ? it.url.trim() : "";
    if (!url) continue;
    out.push({
      url,
      title: typeof it?.title === "string" ? it.title : undefined,
      note: typeof it?.note === "string" ? it.note : undefined,
    });
    if (out.length >= 20) break;
  }
  return out;
}

function daysBetween(a: number, b: number): number {
  const ms = Math.abs(a - b);
  return ms / (1000 * 60 * 60 * 24);
}

function isStaleAfterEmail3(lead: Lead): boolean {
  const stage = (lead.stage ?? "").trim().toLowerCase();
  if (stage !== "demo_sent") return false;
  const lc = lead.last_contacted_at ? Date.parse(lead.last_contacted_at) : NaN;
  if (!Number.isFinite(lc)) return false;
  return daysBetween(Date.now(), lc) > 5;
}

function csvEscape(value: string): string {
  const s = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function LeadmaschineClient() {
  const [segmentTab, setSegmentTab] = useState<"enterprise" | "smb">("enterprise");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [abschlussNotice, setAbschlussNotice] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<LeadDetailsPayload | null>(null);
  const [research, setResearch] = useState<ResearchNotes | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchStatus, setResearchStatus] = useState<string | null>(null);
  const [researchDraft, setResearchDraft] = useState<{
    summary: string;
    pain_points: string;
    personalization_hooks: string;
    raw_notes: string;
    confidence: string;
  }>({
    summary: "",
    pain_points: "",
    personalization_hooks: "",
    raw_notes: "",
    confidence: "50",
  });
  const [settings, setSettings] = useState<{
    enabled: boolean;
    leads_per_month: number;
    max_actions_per_run: number;
    leads_per_month_enterprise: number;
    leads_per_month_smb: number;
    max_actions_per_run_enterprise: number;
    max_actions_per_run_smb: number;
    leads_per_day_enterprise: number;
    leads_per_day_smb: number;
    min_seconds_between_gmail_sends: number;
    auto_send_enabled: boolean;
  } | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [runnerBusy, setRunnerBusy] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<string | null>(null);
  const [researchBatchBusy, setResearchBatchBusy] = useState(false);
  const [researchBatchStatus, setResearchBatchStatus] = useState<string | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<string | null>(null);
  const [gmailTestBusy, setGmailTestBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState<PipelineStatusKey | "alle">("alle");

  const [quickLead, setQuickLead] = useState<Lead | null>(null);
  const [quickDraft, setQuickDraft] = useState<{
    manager_name: string;
    linkedin_url: string;
    corporate_group_name: string;
    location_name: string;
    contact_email: string;
    phone: string;
    department: string;
    research_source: string;
    notes: string;
  }>({
    manager_name: "",
    linkedin_url: "",
    corporate_group_name: "",
    location_name: "",
    contact_email: "",
    phone: "",
    department: "",
    research_source: "",
    notes: "",
  });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickStatus, setQuickStatus] = useState<string | null>(null);

  // Modal "Neuer Lead" (manuelle Anlage)
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [newLeadSaving, setNewLeadSaving] = useState(false);
  const [newLeadDraft, setNewLeadDraft] = useState<{
    corporate_group_name: string;
    location_name: string;
    manager_name: string;
    contact_email: string;
    linkedin_url: string;
    phone: string;
    department: string;
    research_source: string;
    industry: string;
    market_segment: string;
    hq_location: string;
    employee_count: string;
    revenue_eur: string;
    domain: string;
    notes: string;
  }>({
    corporate_group_name: "",
    location_name: "",
    manager_name: "",
    contact_email: "",
    linkedin_url: "",
    phone: "",
    department: "",
    research_source: "",
    industry: "",
    market_segment: "",
    hq_location: "",
    employee_count: "",
    revenue_eur: "",
    domain: "",
    notes: "",
  });

  const pipelineCounts = useMemo(() => {
    const counts: Record<PipelineStatusKey, number> = {
      neu: 0,
      email_1_gesendet: 0,
      follow_up_erfolgt: 0,
      demo_angefordert: 0,
      abschluss: 0,
    };
    for (const lead of leads) {
      counts[pipelineStatus(lead).key] += 1;
    }
    return counts;
  }, [leads]);

  const filteredSortedLeads = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const order: Record<PipelineStatusKey, number> = {
      neu: 0,
      email_1_gesendet: 1,
      follow_up_erfolgt: 2,
      demo_angefordert: 3,
      abschluss: 4,
    };

    return [...leads]
      .filter((lead) =>
        (pipelineFilter === "alle" || pipelineStatus(lead).key === pipelineFilter) &&
        (search.length === 0
          ? true
          : (lead.company_name ?? "").toLowerCase().includes(search) ||
            (lead.corporate_group_name ?? "").toLowerCase().includes(search) ||
            (lead.location_name ?? "").toLowerCase().includes(search) ||
            (lead.manager_name ?? "").toLowerCase().includes(search)),
      )
      .sort((a, b) => {
        const aStage = order[pipelineStatus(a).key];
        const bStage = order[pipelineStatus(b).key];
        if (aStage !== bStage) return aStage - bStage;
        const aDate = Date.parse(a.next_action_at ?? a.created_at);
        const bDate = Date.parse(b.next_action_at ?? b.created_at);
        if (Number.isFinite(aDate) && Number.isFinite(bDate)) return bDate - aDate;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
  }, [leads, searchTerm, pipelineFilter]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      if (!silent) setError(null);
      try {
        const resp = await fetch(
          `/api/admin/leads?segment=${encodeURIComponent(segmentTab)}`,
          {
            credentials: "include",
          },
        );
        const p = (await resp.json()) as Payload;
        if (!resp.ok) {
          if (!silent) {
            setError(p.error ?? "Leads konnten nicht geladen werden.");
            setLeads([]);
          }
          return;
        }
        setLeads(Array.isArray(p.leads) ? p.leads : []);
      } catch {
        if (!silent) {
          setError("Netzwerkfehler.");
          setLeads([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [segmentTab],
  );

  useEffect(() => {
    setSelectedLeadId(null);
    setDetails(null);
  }, [segmentTab]);

  useEffect(() => {
    void load();
  }, [load]);

  // "Sofort"-Update für Demo-Link-Klicks + Abschluss-Notifications: leichter Poll.
  // Silent: kein Loading-Flackern, Liste bleibt sichtbar während Hintergrund-Refresh.
  useEffect(() => {
    let cancelled = false;
    const id = window.setInterval(() => {
      if (!cancelled) void load({ silent: true });
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [load]);

  // Benachrichtigung: sobald ein neuer Lead in "Abschluss" landet.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "axon_leadmaschine_seen_abschluss_v1";
    let seen = new Set<string>();
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === "string" && id.trim()) seen.add(id.trim());
        }
      }
    } catch {
      seen = new Set();
    }

    const newly = leads.filter((l) => pipelineStatus(l).key === "abschluss" && !seen.has(l.id));
    if (newly.length > 0) {
      const label = newly.length === 1 ? newly[0]!.company_name : `${newly.length} Leads`;
      setAbschlussNotice(`Neuer Abschluss erreicht: ${label}`);
      for (const l of newly) seen.add(l.id);
      try {
        window.localStorage.setItem(key, JSON.stringify(Array.from(seen).slice(0, 500)));
      } catch {
        // ignore
      }
    }
  }, [leads]);

  const loadSettings = useCallback(async () => {
    try {
      const resp = await fetch("/api/admin/leadmaschine/settings", {
        credentials: "include",
      });
      const p = (await resp.json()) as {
        enabled?: boolean;
        leads_per_month?: number;
        max_actions_per_run?: number;
        leads_per_month_enterprise?: number;
        leads_per_month_smb?: number;
        max_actions_per_run_enterprise?: number;
        max_actions_per_run_smb?: number;
        leads_per_day_enterprise?: number;
        leads_per_day_smb?: number;
        min_seconds_between_gmail_sends?: number;
        auto_send_enabled?: boolean;
      };
      const entDay =
        typeof p.leads_per_day_enterprise === "number"
          ? p.leads_per_day_enterprise
          : Math.max(
              1,
              Math.round(
                (typeof p.leads_per_month_enterprise === "number"
                  ? p.leads_per_month_enterprise
                  : 100) / 30,
              ),
            );
      const smbDay =
        typeof p.leads_per_day_smb === "number"
          ? p.leads_per_day_smb
          : Math.max(
              1,
              Math.round(
                (typeof p.leads_per_month_smb === "number" ? p.leads_per_month_smb : 40) / 30,
              ),
            );
      setSettings({
        enabled: p.enabled !== false,
        leads_per_month:
          typeof p.leads_per_month === "number" ? p.leads_per_month : 100,
        max_actions_per_run:
          typeof p.max_actions_per_run === "number" ? p.max_actions_per_run : 5,
        leads_per_month_enterprise:
          typeof p.leads_per_month_enterprise === "number"
            ? p.leads_per_month_enterprise
            : 100,
        leads_per_month_smb:
          typeof p.leads_per_month_smb === "number" ? p.leads_per_month_smb : 40,
        max_actions_per_run_enterprise:
          typeof p.max_actions_per_run_enterprise === "number"
            ? p.max_actions_per_run_enterprise
            : 5,
        max_actions_per_run_smb:
          typeof p.max_actions_per_run_smb === "number" ? p.max_actions_per_run_smb : 5,
        leads_per_day_enterprise: entDay,
        leads_per_day_smb: smbDay,
        min_seconds_between_gmail_sends:
          typeof p.min_seconds_between_gmail_sends === "number"
            ? p.min_seconds_between_gmail_sends
            : 120,
        auto_send_enabled: p.auto_send_enabled === true,
      });
    } catch {
      setSettings({
        enabled: true,
        leads_per_month: 100,
        max_actions_per_run: 5,
        leads_per_month_enterprise: 100,
        leads_per_month_smb: 40,
        max_actions_per_run_enterprise: 5,
        max_actions_per_run_smb: 5,
        leads_per_day_enterprise: 4,
        leads_per_day_smb: 2,
        min_seconds_between_gmail_sends: 120,
        auto_send_enabled: false,
      });
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = async (next: {
    enabled: boolean;
    leads_per_month: number;
    max_actions_per_run: number;
    leads_per_month_enterprise: number;
    leads_per_month_smb: number;
    max_actions_per_run_enterprise: number;
    max_actions_per_run_smb: number;
    leads_per_day_enterprise: number;
    leads_per_day_smb: number;
    min_seconds_between_gmail_sends: number;
    auto_send_enabled: boolean;
  }) => {
    setSettingsBusy(true);
    setRunnerStatus(null);
    setError(null);
    try {
      const resp = await fetch("/api/admin/leadmaschine/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: next.enabled,
          // leads_per_day_* wird serverseitig ignoriert (Hard-Cap im Code).
          min_seconds_between_gmail_sends: next.min_seconds_between_gmail_sends,
          leads_per_month: next.leads_per_month,
          max_actions_per_run: next.max_actions_per_run,
          leads_per_month_enterprise: next.leads_per_month_enterprise,
          leads_per_month_smb: next.leads_per_month_smb,
          max_actions_per_run_enterprise: next.max_actions_per_run_enterprise,
          max_actions_per_run_smb: next.max_actions_per_run_smb,
          auto_send_enabled: next.auto_send_enabled,
        }),
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setSettings(next);
      setRunnerStatus("Einstellungen gespeichert.");
    } finally {
      setSettingsBusy(false);
    }
  };

  const runRunnerNow = async () => {
    if (runnerBusy) return;
    setRunnerBusy(true);
    setRunnerStatus(null);
    setResearchBatchStatus(null);
    setError(null);
    try {
      const resp = await fetch("/api/admin/leadmaschine/run", {
        method: "POST",
        credentials: "include",
      });
      const p = (await resp.json()) as { error?: string; executed?: number; skipped_rate_limit?: boolean };
      if (!resp.ok) {
        setError(p.error ?? "Runner fehlgeschlagen.");
        return;
      }
      const executed = typeof p.executed === "number" ? p.executed : 0;
      if (p.skipped_rate_limit) {
        setRunnerStatus(
          "Runner: Tages- und/oder Monatslimit erreicht (Rate-Limit aktiv).",
        );
      } else {
        setRunnerStatus(`Runner: ${executed} Aktion(en) vorbereitet.`);
      }
      await load();
    } finally {
      setRunnerBusy(false);
    }
  };

  const runResearchBatchNow = async () => {
    if (researchBatchBusy) return;
    setResearchBatchBusy(true);
    setResearchBatchStatus(null);
    setRunnerStatus(null);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/leadmaschine/research/run?segment=${encodeURIComponent(segmentTab)}&limit=10`,
        { method: "POST", credentials: "include" },
      );
      const p = (await resp.json()) as {
        error?: string;
        executed?: number;
        eligible?: number;
        skipped?: number;
        errors?: Array<{ lead_id?: string; error?: string }>;
      };
      if (!resp.ok) {
        setError(p.error ?? "Auto‑Research Batch fehlgeschlagen.");
        return;
      }
      const executed = typeof p.executed === "number" ? p.executed : 0;
      const eligible = typeof p.eligible === "number" ? p.eligible : executed;
      const skipped = typeof p.skipped === "number" ? p.skipped : Math.max(0, eligible - executed);
      const errCount = Array.isArray(p.errors) ? p.errors.length : 0;
      setResearchBatchStatus(
        `Auto‑Research Batch: ${executed}/${eligible} aktualisiert · übersprungen: ${skipped}${errCount ? ` · Fehler: ${errCount}` : ""}.`,
      );
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setResearchBatchBusy(false);
    }
  };

  const resetNewLeadDraft = () => {
    setNewLeadDraft({
      corporate_group_name: "",
      location_name: "",
      manager_name: "",
      contact_email: "",
      linkedin_url: "",
      phone: "",
      department: "",
      research_source: "",
      industry: "",
      market_segment: "",
      hq_location: "",
      employee_count: "",
      revenue_eur: "",
      domain: "",
      notes: "",
    });
  };

  const submitNewLead = async () => {
    if (newLeadSaving) return;
    setNewLeadSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        lead_segment: segmentTab,
        corporate_group_name: newLeadDraft.corporate_group_name,
        location_name: newLeadDraft.location_name,
        manager_name: newLeadDraft.manager_name,
        contact_email: newLeadDraft.contact_email,
        linkedin_url: newLeadDraft.linkedin_url,
        phone: newLeadDraft.phone || undefined,
        department: newLeadDraft.department || undefined,
        research_source: newLeadDraft.research_source || undefined,
        industry: newLeadDraft.industry || undefined,
        market_segment: newLeadDraft.market_segment || undefined,
        hq_location: newLeadDraft.hq_location || undefined,
        domain: newLeadDraft.domain || undefined,
      };
      if (newLeadDraft.employee_count.trim()) {
        payload.employee_count = Number(newLeadDraft.employee_count);
      }
      if (newLeadDraft.revenue_eur.trim()) {
        payload.revenue_eur = Number(newLeadDraft.revenue_eur);
      }
      const resp = await fetch("/api/admin/leads", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const p = (await resp.json()) as { error?: string; id?: string | null };
      if (!resp.ok) {
        setError(p.error ?? "Lead konnte nicht angelegt werden.");
        return;
      }
      const newId = typeof p.id === "string" ? p.id : null;
      // Optional: initiale Notizen patchen (Notes sind ein eigenes PATCH-Feld).
      if (newId && newLeadDraft.notes.trim()) {
        try {
          await fetch(`/api/admin/leads/${encodeURIComponent(newId)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: newLeadDraft.notes }),
          });
        } catch {
          // Notizen sind optional - kein harter Fehler.
        }
      }
      resetNewLeadDraft();
      setNewLeadOpen(false);
      await load();
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setNewLeadSaving(false);
    }
  };

  const activateGmailWatch = async () => {
    if (gmailBusy) return;
    setGmailBusy(true);
    setGmailStatus(null);
    setError(null);
    try {
      const resp = await fetch("/api/admin/leadmaschine/gmail/watch", {
        method: "POST",
        credentials: "include",
      });
      const p = (await resp.json()) as {
        error?: string;
        inbox?: string;
        topicName?: string;
        historyId?: string | null;
        expiration?: string | number | null;
      };
      if (!resp.ok) {
        setError(p.error ?? "Gmail Watch konnte nicht aktiviert werden.");
        return;
      }
      const exp =
        p.expiration != null ? String(p.expiration) : "—";
      setGmailStatus(
        `Gmail Watch aktiv. Inbox: ${p.inbox ?? "—"} · Expiration: ${exp}`,
      );
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setGmailBusy(false);
    }
  };

  const runGmailDryRun = async () => {
    if (gmailTestBusy) return;
    setGmailTestBusy(true);
    setGmailStatus(null);
    setError(null);
    try {
      const resp = await fetch("/api/admin/leadmaschine/gmail/test", {
        method: "POST",
        credentials: "include",
      });
      const p = (await resp.json()) as {
        error?: string;
        ok?: boolean;
        phase?: string;
        note?: string;
        inbox?: string;
        profile_email?: string | null;
        messages_total?: number | null;
        inbox_messages_added?: number;
        tokens_found?: number;
        tokens_matched?: number;
        start_history_id?: string;
      };
      if (!resp.ok) {
        setError(p.error ?? "Gmail Dry‑Run fehlgeschlagen.");
        return;
      }
      if (p.phase === "oauth_only") {
        setGmailStatus(
          `Gmail OK · Konto: ${p.profile_email ?? p.inbox ?? "—"}` +
            (p.messages_total != null ? ` · Postfach-Nachrichten: ${p.messages_total}` : "") +
            `. ${p.note ?? ""}`,
        );
        return;
      }
      if (p.phase === "oauth_ok_history_failed") {
        setGmailStatus(
          `Gmail OAuth OK, History-Problem: ${(p as { history_error?: string }).history_error ?? "—"}. ${p.note ?? ""}`,
        );
        return;
      }
      setGmailStatus(
        `Dry‑Run OK · Mails: ${p.inbox_messages_added ?? 0} · Tokens: ${p.tokens_found ?? 0} · Matches: ${p.tokens_matched ?? 0}`,
      );
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setGmailTestBusy(false);
    }
  };

  const openDetails = async (lead: Lead) => {
    setSelectedLeadId(lead.id);
    setDetails(null);
    setResearch(null);
    setResearchStatus(null);
    setDetailsLoading(true);
    setError(null);
    try {
      const [resp, rresp] = await Promise.all([
        fetch(`/api/admin/leads/${encodeURIComponent(lead.id)}/details`, {
          credentials: "include",
        }),
        fetch(`/api/admin/leads/${encodeURIComponent(lead.id)}/research`, {
          credentials: "include",
        }),
      ]);

      const p = (await resp.json()) as LeadDetailsPayload;
      if (!resp.ok) {
        setError(p.error ?? "Details konnten nicht geladen werden.");
        setDetails(null);
        return;
      }
      setDetails(p);

      const rp = (await rresp.json()) as { error?: string; research?: ResearchNotes | null };
      if (rresp.ok) {
        const rn = (rp.research ?? null) as ResearchNotes | null;
        setResearch(rn);
        setResearchDraft({
          summary: typeof rn?.summary === "string" ? rn.summary : "",
          pain_points: typeof rn?.pain_points === "string" ? rn.pain_points : "",
          personalization_hooks:
            typeof rn?.personalization_hooks === "string" ? rn.personalization_hooks : "",
          raw_notes: typeof rn?.raw_notes === "string" ? rn.raw_notes : "",
          confidence:
            typeof rn?.confidence === "number" && Number.isFinite(rn.confidence)
              ? String(rn.confidence)
              : "50",
        });
      }
    } catch {
      setError("Netzwerkfehler.");
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openQuickEdit = (lead: Lead) => {
    setQuickLead(lead);
    setQuickDraft({
      manager_name: typeof lead.manager_name === "string" ? lead.manager_name : "",
      linkedin_url: typeof lead.linkedin_url === "string" ? lead.linkedin_url : "",
      corporate_group_name:
        typeof lead.corporate_group_name === "string" ? lead.corporate_group_name : "",
      location_name: typeof lead.location_name === "string" ? lead.location_name : "",
      contact_email: typeof lead.contact_email === "string" ? lead.contact_email : "",
      phone: typeof lead.phone === "string" ? lead.phone : "",
      department: typeof lead.department === "string" ? lead.department : "",
      research_source:
        typeof lead.research_source === "string" ? lead.research_source : "",
      notes: typeof lead.notes === "string" ? lead.notes : "",
    });
    setQuickStatus(null);
    setError(null);
  };

  const saveQuickNotes = async () => {
    const lead = quickLead;
    if (!lead || quickSaving) return;
    setQuickSaving(true);
    setQuickStatus(null);
    setError(null);
    try {
      const patch: Record<string, unknown> = {
        notes: quickDraft.notes,
        manager_name: quickDraft.manager_name,
        corporate_group_name: quickDraft.corporate_group_name,
        location_name: quickDraft.location_name,
        contact_email: quickDraft.contact_email,
        phone: quickDraft.phone,
        department: quickDraft.department,
        research_source: quickDraft.research_source,
      };
      if (quickDraft.linkedin_url.trim()) {
        patch.linkedin_url = quickDraft.linkedin_url;
      }
      const resp = await fetch(`/api/admin/leads/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const p = (await resp.json()) as {
        error?: string;
        lead?: Partial<Lead> | null;
      };
      if (!resp.ok) {
        setError(p.error ?? "Lead konnte nicht gespeichert werden.");
        return;
      }
      const patched = p.lead ?? null;
      setLeads((prev) =>
        prev.map((x) =>
          x.id === lead.id
            ? {
                ...x,
                notes: patched?.notes ?? (quickDraft.notes.trim() || null),
                manager_name:
                  patched?.manager_name ?? (quickDraft.manager_name.trim() || null),
                linkedin_url:
                  patched?.linkedin_url ?? (quickDraft.linkedin_url.trim() || (x.linkedin_url ?? null)),
                corporate_group_name:
                  patched?.corporate_group_name ??
                  (quickDraft.corporate_group_name.trim() || null),
                location_name:
                  patched?.location_name ?? (quickDraft.location_name.trim() || null),
                contact_email:
                  patched?.contact_email ?? (quickDraft.contact_email.trim() || null),
                phone: patched?.phone ?? (quickDraft.phone.trim() || null),
                department:
                  patched?.department ?? (quickDraft.department.trim() || null),
                research_source:
                  patched?.research_source ?? (quickDraft.research_source.trim() || null),
              }
            : x,
        ),
      );
      setQuickLead((cur) => (cur?.id === lead.id ? { ...cur, ...patched } : cur));
      setQuickStatus("Lead gespeichert.");

      if (selectedLeadId === lead.id) {
        setDetails((d) =>
          d?.lead?.id === lead.id
            ? { ...d, lead: { ...(d.lead as Lead), ...(patched ?? {}) } as Lead }
            : d,
        );
      }
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setQuickSaving(false);
    }
  };

  const exportPipelineCsv = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const filename = `axoncore_pipeline_export_${segmentTab}_${date}.csv`;

    const header = [
      "Firma",
      "Domain",
      "Segment",
      "Status",
      "Sequenz",
      "Letzter Kontakt",
      "Nächste Aktion",
      "Kontakt E-Mail",
      "Interne Notizen",
    ];

    const lines = [
      header.map(csvEscape).join(";"),
      ...filteredSortedLeads.map((l) => {
        const status = pipelineStatus(l).label;
        const lastContact = l.last_contacted_at
          ? new Date(l.last_contacted_at).toLocaleString("de-DE", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";
        const nextAction = l.next_action_at
          ? new Date(l.next_action_at).toLocaleString("de-DE", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";
        const notes = typeof l.notes === "string" ? l.notes : "";
        return [
          l.company_name ?? "",
          l.domain ?? "",
          l.market_segment ?? "",
          status,
          leadSequenceEmailStep(l).csv,
          lastContact,
          nextAction,
          l.contact_email ?? "",
          notes,
        ]
          .map((v) => csvEscape(String(v ?? "")))
          .join(";");
      }),
    ];

    downloadCsv(filename, lines.join("\n"));
  };

  const saveResearch = async () => {
    const leadId = selectedLeadId;
    if (!leadId || researchBusy) return;
    setResearchBusy(true);
    setResearchStatus(null);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/research`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: researchDraft.summary,
          pain_points: researchDraft.pain_points,
          personalization_hooks: researchDraft.personalization_hooks,
          raw_notes: researchDraft.raw_notes,
          confidence: Number(researchDraft.confidence),
          sources: research?.sources ?? [],
        }),
      });
      const p = (await resp.json()) as { error?: string; research?: ResearchNotes | null };
      if (!resp.ok) {
        setError(p.error ?? "Research konnte nicht gespeichert werden.");
        return;
      }
      setResearch(p.research ?? null);
      setResearchStatus("Research gespeichert.");
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setResearchBusy(false);
    }
  };

  const generateResearch = async () => {
    const leadId = selectedLeadId;
    if (!leadId || researchBusy) return;
    setResearchBusy(true);
    setResearchStatus(null);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/leads/${encodeURIComponent(leadId)}/research/generate`,
        { method: "POST", credentials: "include" },
      );
      const p = (await resp.json()) as { error?: string; research?: ResearchNotes | null };
      if (!resp.ok) {
        setError(p.error ?? "Auto‑Research fehlgeschlagen.");
        return;
      }
      const rn = (p.research ?? null) as ResearchNotes | null;
      setResearch(rn);
      setResearchDraft({
        summary: typeof rn?.summary === "string" ? rn.summary : "",
        pain_points: typeof rn?.pain_points === "string" ? rn.pain_points : "",
        personalization_hooks:
          typeof rn?.personalization_hooks === "string" ? rn.personalization_hooks : "",
        raw_notes: typeof rn?.raw_notes === "string" ? rn.raw_notes : "",
        confidence:
          typeof rn?.confidence === "number" && Number.isFinite(rn.confidence)
            ? String(rn.confidence)
            : "55",
      });
      setResearchStatus("Auto‑Research erzeugt.");
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setResearchBusy(false);
    }
  };

  const refreshDetails = async () => {
    if (!selectedLeadId) return;
    await openDetails({ id: selectedLeadId } as Lead);
  };

  const onDelete = async (lead: Lead) => {
    if (!window.confirm(`Lead „${lead.company_name}“ wirklich löschen?`)) return;
    setDeletingId(lead.id);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/leads/${encodeURIComponent(lead.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const runSequence = async (
    lead: Lead,
    action: "mail_1" | "follow_up" | "demo" | "disqualify" | "mark_replied",
  ) => {
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/leads/${encodeURIComponent(lead.id)}/sequence`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const p = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Aktion fehlgeschlagen.");
        return;
      }
      await load();
    } catch {
      setError("Netzwerkfehler.");
    }
  };

  return (
    <div className="space-y-8">
      {abschlussNotice ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-100">
          {abschlussNotice}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 rounded-lg border border-[#1f1f1f] bg-[#080808] p-1.5">
        <button
          type="button"
          onClick={() => setSegmentTab("enterprise")}
          className={`min-w-0 flex-1 rounded-md px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition sm:flex-none ${
            segmentTab === "enterprise"
              ? "border border-[#c9a962]/40 bg-[#c9a962]/12 text-[#e8dcb8]"
              : "border border-transparent text-[#7a7a7a] hover:border-[#2a2a2a] hover:text-[#b0b0b0]"
          }`}
        >
          Großkunden (Enterprise)
        </button>
        <button
          type="button"
          onClick={() => setSegmentTab("smb")}
          className={`min-w-0 flex-1 rounded-md px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition sm:flex-none ${
            segmentTab === "smb"
              ? "border border-[#c9a962]/40 bg-[#c9a962]/12 text-[#e8dcb8]"
              : "border border-transparent text-[#7a7a7a] hover:border-[#2a2a2a] hover:text-[#b0b0b0]"
          }`}
        >
          Kleinunternehmer (KMU)
        </button>
      </div>

      <section className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#1f1f1f] pb-3">
          <div className="min-w-0">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#c4c4c4]">
              Steuerung
            </h2>
            <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
              Monatsrate drosseln/beschleunigen und Runner manuell ausführen.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetNewLeadDraft();
                setNewLeadOpen(true);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/12 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e8dcb8] transition hover:bg-[#c9a962]/18"
              title="Manuell recherchierten Lead in die Pipeline aufnehmen (UWG §7 konform)"
            >
              <Plus className="size-3.5" strokeWidth={1.8} aria-hidden />
              Neuer Lead
            </button>
            <button
              type="button"
              onClick={() => void runResearchBatchNow()}
              disabled={researchBatchBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1f1f1f] bg-[#080808] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
              title="Füllt Research Notes für die neuesten Leads nach"
            >
              {researchBatchBusy ? "Research…" : "Auto‑Research Batch"}
            </button>
            <button
              type="button"
              onClick={() => void activateGmailWatch()}
              disabled={gmailBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1f1f1f] bg-[#080808] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gmailBusy ? "Gmail…" : "Gmail Watch"}
            </button>
            <button
              type="button"
              onClick={() => void runGmailDryRun()}
              disabled={gmailTestBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1f1f1f] bg-[#080808] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gmailTestBusy ? "Test…" : "Gmail Test"}
            </button>
            <button
              type="button"
              onClick={() => void runRunnerNow()}
              disabled={runnerBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/35 bg-[#c9a962]/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runnerBusy ? "Runner…" : "Runner jetzt"}
            </button>
          </div>
        </div>

        {runnerStatus ? (
          <div className="mb-3 rounded-md border border-[#1f1f1f] bg-[#080808] px-3 py-2 font-mono text-[10px] text-[#8a8a8a]">
            {runnerStatus}
          </div>
        ) : null}

        {researchBatchStatus ? (
          <div className="mb-3 rounded-md border border-[#1f1f1f] bg-[#080808] px-3 py-2 font-mono text-[10px] text-[#8a8a8a]">
            {researchBatchStatus}
          </div>
        ) : null}

        {gmailStatus ? (
          <div className="mb-3 rounded-md border border-[#1f1f1f] bg-[#080808] px-3 py-2 font-mono text-[10px] text-[#8a8a8a]">
            {gmailStatus}
          </div>
        ) : null}

        {settings ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                Aktiv
              </p>
              <button
                type="button"
                disabled={settingsBusy}
                onClick={() =>
                  void saveSettings({
                    ...settings,
                    enabled: !settings.enabled,
                  })
                }
                className={`mt-3 inline-flex items-center rounded-full border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] transition disabled:opacity-50 ${
                  settings.enabled
                    ? "border-[#c9a962]/45 bg-[#c9a962]/10 text-[#d4c896] hover:bg-[#c9a962]/15"
                    : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#3a3a3a]"
                }`}
              >
                {settings.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div className="rounded-md border border-[#c9a962]/25 bg-[#c9a962]/[0.04] p-4">
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
                Neue Kontakte / Tag (Mail 1)
              </p>
              <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#8a8a8a]">
                DSGVO / UWG §7 Hard-Cap. Im Code fixiert, nicht editierbar.
                Follow-Ups (Tag 3) und Demos (Tag 5) zählen NICHT gegen diesen Cap.
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-[28px] font-semibold text-[#e4d3a0]">5</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                  / Tag fix
                </span>
              </div>
              <p className="mt-2 font-mono text-[8px] leading-relaxed text-[#6a6a6a]">
                Ablauf pro Lead: Tag 1 Erstkontakt → Tag 3 Follow-Up → Tag 5 Demo-Einladung.
              </p>
            </div>

            <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                Gmail Mindestabstand
              </p>
              <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#4a4a4a]">
                Sekunden zwischen Versänden (Spam-Schutz bei manuellem Senden).
              </p>
              <input
                type="number"
                min={30}
                max={3600}
                value={settings.min_seconds_between_gmail_sends}
                disabled={settingsBusy}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          min_seconds_between_gmail_sends: Number(e.target.value),
                        }
                      : s,
                  )
                }
                className="mt-3 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
              />
              <button
                type="button"
                disabled={settingsBusy || !settings}
                onClick={() => settings && void saveSettings(settings)}
                className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:opacity-50"
              >
                Speichern
              </button>
            </div>

            <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                Max Aktionen / Run
              </p>
              <input
                type="number"
                min={1}
                max={50}
                value={
                  segmentTab === "enterprise"
                    ? settings.max_actions_per_run_enterprise
                    : settings.max_actions_per_run_smb
                }
                disabled={settingsBusy}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          max_actions_per_run:
                            segmentTab === "enterprise"
                              ? Number(e.target.value)
                              : s.max_actions_per_run,
                          max_actions_per_run_enterprise:
                            segmentTab === "enterprise"
                              ? Number(e.target.value)
                              : s.max_actions_per_run_enterprise,
                          max_actions_per_run_smb:
                            segmentTab === "smb"
                              ? Number(e.target.value)
                              : s.max_actions_per_run_smb,
                        }
                      : s,
                  )
                }
                className="mt-3 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
              />
              <button
                type="button"
                disabled={settingsBusy || !settings}
                onClick={() => settings && void saveSettings(settings)}
                className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:opacity-50"
              >
                Speichern
              </button>
            </div>

            <div
              className={`rounded-md border p-4 ${
                settings.auto_send_enabled
                  ? "border-red-500/40 bg-red-500/[0.06]"
                  : "border-[#1f1f1f] bg-[#080808]"
              }`}
            >
              <p
                className={`font-mono text-[9px] font-medium uppercase tracking-[0.16em] ${
                  settings.auto_send_enabled ? "text-red-300" : "text-[#5a5a5a]"
                }`}
              >
                Auto‑Versand
              </p>
              <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#6a6a6a]">
                {settings.auto_send_enabled
                  ? "AKTIV: Cron sendet Mails automatisch über Gmail. Generic-Postfächer (info@/kontakt@/…) werden hardcoded geblockt."
                  : "Aus. Cron bereitet nur Drafts vor, du klickst manuell auf 'Senden'."}
              </p>
              <button
                type="button"
                disabled={settingsBusy}
                onClick={() =>
                  void saveSettings({
                    ...settings,
                    auto_send_enabled: !settings.auto_send_enabled,
                  })
                }
                className={`mt-3 inline-flex w-full items-center justify-center rounded-full border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] transition disabled:opacity-50 ${
                  settings.auto_send_enabled
                    ? "border-red-500/50 bg-red-500/15 text-red-200 hover:bg-red-500/20"
                    : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
                }`}
              >
                {settings.auto_send_enabled ? "Auto‑Send AN" : "Auto‑Send AUS"}
              </button>
              {settings.auto_send_enabled ? (
                <p className="mt-2 font-mono text-[8px] leading-relaxed text-red-300/80">
                  UWG §7: Erstkontakte gehen an benannte Entscheider. Pro Lead lässt
                  sich Auto‑Send über das Feld leads.auto_send_blocked sperren.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="font-mono text-[10px] text-[#6b6b6b]">Lade Settings…</p>
        )}
      </section>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[10px] text-red-200">
          {error}
        </div>
      ) : null}

      <section className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#1f1f1f] pb-3">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#c4c4c4]">
            Pipeline
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportPipelineCsv}
              disabled={loading || filteredSortedLeads.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1f1f1f] bg-[#080808] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
              title="Aktuelle Liste als CSV exportieren"
            >
              Pipeline Export
            </button>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Suche nach Firmenname…"
              className="w-56 rounded-md border border-[#262626] bg-[#080808] px-3 py-1.5 font-mono text-[10px] text-[#d4d4d4] outline-none placeholder:text-[#4a4a4a] focus:border-[#c9a962]/40"
            />
            <div className="font-mono text-[10px] text-[#6b6b6b]">
              {loading ? "Lade…" : `${filteredSortedLeads.length} Leads`}
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {pipelineTabs.map((tab) => {
            const active = pipelineFilter === tab.key;
            const count =
              tab.key === "alle"
                ? leads.length
                : pipelineCounts[tab.key as PipelineStatusKey];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPipelineFilter(tab.key)}
                className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                  active
                    ? "border-[#c9a962]/45 bg-[#c9a962]/12 text-[#e8dcb8]"
                    : "border-[#2a2a2a] bg-[#080808] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="font-mono text-[10px] text-[#6b6b6b]">Lade Leads…</p>
        ) : filteredSortedLeads.length === 0 ? (
          <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
            <p className="font-mono text-[10px] text-[#8a8a8a]">
              Keine Leads gefunden.
            </p>
            <p className="mt-1 font-mono text-[10px] text-[#5a5a5a]">
              {searchTerm.trim()
                ? "Passe den Suchbegriff an oder entferne ihn."
                : segmentTab === "enterprise"
                  ? "Noch kein Konzern-Standort erfasst. Recherchiere manuell (z. B. LinkedIn) und klicke auf „Neuer Lead“."
                  : "Noch kein KMU-Lead erfasst. Recherchiere manuell und klicke auf „Neuer Lead“."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0">
              <thead>
                <tr className="text-left font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5a5a]">
                  <th className="py-2 pr-3">Konzern</th>
                  <th className="py-2 pr-3">Standort</th>
                  <th className="py-2 pr-3">Manager</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">E-Mail (1–3)</th>
                  <th className="py-2 pr-3">Nächste Aktion</th>
                  <th className="py-2 pr-3 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filteredSortedLeads.map((l) => {
                  const seq = leadSequenceEmailStep(l);
                  const stale = isStaleAfterEmail3(l);
                  const groupName = l.corporate_group_name ?? l.company_name;
                  const locName = l.location_name ?? (l.corporate_group_name ? null : l.company_name);
                  return (
                    <tr
                      key={l.id}
                      className={`border-t font-mono text-[11px] text-[#d4d4d4] ${
                        stale ? "border-red-500/20 bg-red-950/15" : "border-[#1f1f1f]"
                      }`}
                    >
                    <td className="py-3 pr-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openQuickEdit(l)}
                          className="truncate text-left text-[#e8e8e8] transition hover:text-white"
                          title="Quick‑Edit öffnen"
                        >
                          {groupName}
                        </button>
                        {l.domain ? (
                          <div className="mt-1 text-[10px] text-[#6b6b6b]">{l.domain}</div>
                        ) : null}
                        {stale ? (
                          <div className="mt-1 text-[10px] text-red-300/70">
                            Keine Antwort seit &gt; 5 Tagen (Email 3)
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-[#c4c4c4]">
                      <div className="min-w-0">
                        <div className="truncate">{locName ?? "—"}</div>
                        {l.hq_location ? (
                          <div className="mt-1 text-[10px] text-[#5a5a5a]">HQ: {l.hq_location}</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-[#c4c4c4]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{l.manager_name ?? "—"}</span>
                          {l.linkedin_url ? (
                            <a
                              href={l.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                              title="LinkedIn-Profil öffnen"
                              className="shrink-0 rounded border border-[#2a2a2a] bg-[#080808] p-1 text-[#8a8a8a] transition hover:border-[#c9a962]/45 hover:text-[#d4c896]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="size-3" strokeWidth={1.6} aria-hidden />
                            </a>
                          ) : null}
                        </div>
                        {l.department ? (
                          <div className="mt-1 text-[10px] text-[#5a5a5a]">{l.department}</div>
                        ) : null}
                        {l.contact_email ? (
                          <div className="mt-1 truncate text-[10px] text-[#6b6b6b]" title={l.contact_email}>
                            {l.contact_email}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="mb-1">
                        <span className="rounded border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-0.5 text-[9px] text-[#8a8a8a]">
                          {pipelineStatus(l).label}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex w-fit items-center rounded border border-[#c9a962]/35 bg-[#c9a962]/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-[#e8dcb8]">
                          {seq.nextEmail != null
                            ? `Nächste: E-Mail ${seq.nextEmail}`
                            : "Sequenz fertig"}
                        </span>
                        {seq.sequenceTag != null ? (
                          <span className="text-[9px] text-[#6b6b6b]">
                            Sequenz-Tag {seq.sequenceTag} (Pipeline 1·3·5)
                          </span>
                        ) : (
                          <span className="text-[9px] text-[#6b6b6b]">
                            Tag 1 · 3 · 5 abgeschlossen
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-[10px] text-[#a8a8a8]">
                      <span className="text-[#d4d4d4]">{seq.label}</span>
                    </td>
                    <td className="py-3 pr-3 text-[10px] text-[#6b6b6b]">
                      {l.next_action_at
                        ? new Date(l.next_action_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })
                        : "—"}
                      {l.last_contacted_at ? (
                        <div className="mt-1 text-[10px] text-[#5a5a5a]">
                          Letzter Kontakt:{" "}
                          {new Date(l.last_contacted_at).toLocaleDateString("de-DE", { dateStyle: "short" })}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openDetails(l)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#1f1f1f] bg-[#0a0a0a] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4]"
                          title="Details öffnen (Timeline & E-Mails)"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => void runSequence(l, "mail_1")}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/25 bg-[#c9a962]/[0.06] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4c896] transition hover:border-[#c9a962]/40 hover:bg-[#c9a962]/10"
                          title="Mail 1 vorbereiten"
                        >
                          <Send className="size-3.5" strokeWidth={1.5} aria-hidden />
                          Mail 1
                        </button>
                        <button
                          type="button"
                          onClick={() => void runSequence(l, "follow_up")}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#1f1f1f] bg-[#0a0a0a] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4]"
                          title="Follow-Up vorbereiten"
                        >
                          Follow‑Up
                        </button>
                        <button
                          type="button"
                          onClick={() => void runSequence(l, "demo")}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#1f1f1f] bg-[#0a0a0a] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4]"
                          title="Demo-Mail vorbereiten"
                        >
                          Demo
                        </button>
                        <button
                          type="button"
                          onClick={() => void runSequence(l, "mark_replied")}
                          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-200 transition hover:border-emerald-500/45 hover:bg-emerald-500/15"
                          title="Antwort erkannt (Pipeline stoppen)"
                        >
                          Antwort
                        </button>
                        <button
                          type="button"
                          onClick={() => void runSequence(l, "disqualify")}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a] transition hover:border-red-500/40 hover:bg-red-950/20 hover:text-red-300"
                          title="Disqualifizieren"
                        >
                          Entfernen
                        </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(l)}
                        disabled={deletingId === l.id}
                        className="inline-flex items-center justify-center rounded-md border border-[#2a2a2a] p-1.5 text-[#6b6b6b] transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Lead ${l.company_name} löschen`}
                        title="Lead löschen"
                      >
                        <Trash2 className="size-4" strokeWidth={1.5} />
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
      </section>

      {selectedLeadId ? (
        <section className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#1f1f1f] pb-3">
            <div className="min-w-0">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#c4c4c4]">
                Lead-Details
              </h2>
              <p className="mt-1 font-mono text-[10px] text-[#6b6b6b]">
                Timeline (Events) und vollständiger E-Mail-Content.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedLeadId(null);
                setDetails(null);
              }}
              className="rounded-md border border-[#2a2a2a] bg-[#080808] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a] hover:border-[#3a3a3a] hover:text-[#9a9a9a]"
            >
              Schließen
            </button>
          </div>

          {detailsLoading ? (
            <p className="font-mono text-[10px] text-[#6b6b6b]">Lade Details…</p>
          ) : !details ? (
            <p className="font-mono text-[10px] text-[#6b6b6b]">Keine Details geladen.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a7a7a]">
                      Research Notes
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={researchBusy}
                        onClick={() => void generateResearch()}
                        className="inline-flex items-center rounded-md border border-[#c9a962]/35 bg-[#c9a962]/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {researchBusy ? "Research…" : "Auto‑Research"}
                      </button>
                      <button
                        type="button"
                        disabled={researchBusy}
                        onClick={() => void saveResearch()}
                        className="inline-flex items-center rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {researchBusy ? "Speichere…" : "Speichern"}
                      </button>
                    </div>
                  </div>

                  {researchStatus ? (
                    <div className="mt-3 rounded border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[10px] text-[#8a8a8a]">
                      {researchStatus}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3">
                    {Array.isArray(research?.sources) && research?.sources.length > 0 ? (
                      <div className="rounded-md border border-[#141414] bg-[#050505] p-3">
                        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                          Quellen
                        </p>
                        <ul className="mt-2 space-y-1">
                          {asResearchSources(research.sources).slice(0, 10).map((s, idx) => {
                            const url = s.url;
                            const note = s.note ?? null;
                            return (
                              <li key={`${url}-${idx}`} className="flex items-start gap-2">
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate font-mono text-[10px] text-[#8a8a8a] hover:text-[#d4d4d4]"
                                  title={url}
                                >
                                  {url}
                                </a>
                                {note ? (
                                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5a5a]">
                                    {note}
                                  </span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                    <div>
                      <label className="block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                        Kurzprofil
                      </label>
                      <textarea
                        rows={3}
                        value={researchDraft.summary}
                        onChange={(e) =>
                          setResearchDraft((s) => ({ ...s, summary: e.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-[#262626] bg-[#050505] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none placeholder:text-[#4a4a4a] focus:border-[#c9a962]/40"
                        placeholder="2–5 Sätze: wer, was, warum relevant."
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                        Pain Points
                      </label>
                      <textarea
                        rows={4}
                        value={researchDraft.pain_points}
                        onChange={(e) =>
                          setResearchDraft((s) => ({ ...s, pain_points: e.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-[#262626] bg-[#050505] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none placeholder:text-[#4a4a4a] focus:border-[#c9a962]/40"
                        placeholder="- Fluktuation …\n- Einweisungen dauern …\n- Wissen verteilt auf Köpfe …"
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                        Hooks
                      </label>
                      <textarea
                        rows={4}
                        value={researchDraft.personalization_hooks}
                        onChange={(e) =>
                          setResearchDraft((s) => ({
                            ...s,
                            personalization_hooks: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-[#262626] bg-[#050505] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none placeholder:text-[#4a4a4a] focus:border-[#c9a962]/40"
                        placeholder="Konkrete Anknüpfungspunkte: Produktlinie, Initiative, Standort, aktuelle Themen …"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                          Confidence (0–100)
                        </label>
                        <input
                          value={researchDraft.confidence}
                          onChange={(e) =>
                            setResearchDraft((s) => ({ ...s, confidence: e.target.value }))
                          }
                          inputMode="numeric"
                          className="mt-1 w-full rounded-md border border-[#262626] bg-[#050505] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
                          placeholder="50"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                          Letztes Update
                        </label>
                        <div className="mt-1 rounded-md border border-[#262626] bg-[#050505] px-3 py-2 font-mono text-[11px] text-[#8a8a8a]">
                          {research?.updated_at
                            ? new Date(research.updated_at).toLocaleString("de-DE", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[#5a5a5a]">
                        Notizen (optional)
                      </label>
                      <textarea
                        rows={4}
                        value={researchDraft.raw_notes}
                        onChange={(e) =>
                          setResearchDraft((s) => ({ ...s, raw_notes: e.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-[#262626] bg-[#050505] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none placeholder:text-[#4a4a4a] focus:border-[#c9a962]/40"
                        placeholder="Freitext: Gesprächsnotizen, interne Signale, Ansprechpartner …"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
                  <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a7a7a]">
                    Timeline
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {(details.events ?? []).length === 0 ? (
                      <li className="font-mono text-[10px] text-[#6b6b6b]">
                        Noch keine Events.
                      </li>
                    ) : (
                      (details.events ?? []).map((ev) => (
                        <li
                          key={ev.id}
                          className="rounded border border-[#141414] bg-[#050505] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-[10px] text-[#d4d4d4]">
                              {ev.event_type}
                            </span>
                            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b6b6b]">
                              {new Date(ev.created_at).toLocaleString("de-DE", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5a5a]">
                            {ev.channel} · {ev.status}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              <div className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
                <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a7a7a]">
                  E-Mails
                </h3>
                <div className="mt-3 space-y-3">
                  {(details.messages ?? []).length === 0 ? (
                    <p className="font-mono text-[10px] text-[#6b6b6b]">
                      Noch keine vorbereiteten Nachrichten.
                    </p>
                  ) : (
                    (details.messages ?? []).map((m) => (
                      <article
                        key={m.id}
                        className="rounded border border-[#141414] bg-[#050505] p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c9a962]/80">
                              {m.message_type}
                            </p>
                            <p className="mt-1 truncate font-mono text-[11px] text-[#e8e8e8]">
                              {m.subject ?? "—"}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b6b6b]">
                            {new Date(m.created_at).toLocaleString("de-DE", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>
                        <pre className="mt-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#c8c8c8]">
                          {m.body}
                        </pre>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="font-mono text-[10px] text-[#6b6b6b]">
                            {m.sent_at
                              ? `Gesendet${m.to_email ? ` an ${m.to_email}` : ""}`
                              : "Vorbereitet"}
                          </div>
                          <button
                            type="button"
                            disabled={!!m.sent_at}
                            onClick={() => {
                              const leadId = selectedLeadId;
                              if (!leadId) return;
                              void (async () => {
                                setError(null);
                                try {
                                  const resp = await fetch(
                                    `/api/admin/leads/${encodeURIComponent(leadId)}/send`,
                                    {
                                      method: "POST",
                                      credentials: "include",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ message_id: m.id }),
                                    },
                                  );
                                  const p = (await resp.json()) as { error?: string };
                                  if (!resp.ok) {
                                    setError(p.error ?? "Versand fehlgeschlagen.");
                                    return;
                                  }
                                  await refreshDetails();
                                } catch {
                                  setError("Netzwerkfehler.");
                                }
                              })();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/25 bg-[#c9a962]/[0.06] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4c896] transition hover:border-[#c9a962]/40 hover:bg-[#c9a962]/10 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Live versenden (Gmail)"
                          >
                            <Send className="size-3.5" strokeWidth={1.5} aria-hidden />
                            Senden
                          </button>
                        </div>
                        {m.sent_at ? (
                          <p className="mt-2 font-mono text-[10px] text-[#5a5a5a]">
                            {new Date(m.sent_at).toLocaleString("de-DE", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </p>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {newLeadOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !newLeadSaving) {
              setNewLeadOpen(false);
            }
          }}
        >
          <div className="mt-8 w-full max-w-2xl rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#1a1a1a] px-5 py-4">
              <div>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#d4d4d4]">
                  Neuer Lead · {segmentTab === "enterprise" ? "Konzern-Standort" : "KMU"}
                </h3>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5a5a]">
                  UWG §7 · Konkreter Entscheider, keine Info@-Adressen
                </p>
              </div>
              <button
                type="button"
                onClick={() => !newLeadSaving && setNewLeadOpen(false)}
                className="rounded-md border border-[#1f1f1f] bg-[#080808] p-1.5 text-[#6b6b6b] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={newLeadSaving}
                aria-label="Schließen"
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </header>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Konzernname *
                  </span>
                  <input
                    type="text"
                    value={newLeadDraft.corporate_group_name}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, corporate_group_name: e.target.value }))
                    }
                    placeholder="z. B. Siemens AG"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Standort *
                  </span>
                  <input
                    type="text"
                    value={newLeadDraft.location_name}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, location_name: e.target.value }))
                    }
                    placeholder="z. B. Werk München"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Manager-Name *
                  </span>
                  <input
                    type="text"
                    value={newLeadDraft.manager_name}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, manager_name: e.target.value }))
                    }
                    placeholder="z. B. Dr. Anna Schmidt"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Kontakt-E-Mail *
                  </span>
                  <input
                    type="email"
                    value={newLeadDraft.contact_email}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, contact_email: e.target.value }))
                    }
                    placeholder="anna.schmidt@siemens.com"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    LinkedIn-URL *
                  </span>
                  <input
                    type="url"
                    value={newLeadDraft.linkedin_url}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, linkedin_url: e.target.value }))
                    }
                    placeholder="https://www.linkedin.com/in/…"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Telefon (optional)
                  </span>
                  <input
                    type="tel"
                    value={newLeadDraft.phone}
                    onChange={(e) => setNewLeadDraft((d) => ({ ...d, phone: e.target.value }))}
                    placeholder="+49 …"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Abteilung / Funktion (optional)
                  </span>
                  <input
                    type="text"
                    value={newLeadDraft.department}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, department: e.target.value }))
                    }
                    placeholder="z. B. Leiter Instandhaltung"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Quelle der Recherche (optional)
                  </span>
                  <input
                    type="text"
                    value={newLeadDraft.research_source}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, research_source: e.target.value }))
                    }
                    placeholder="z. B. LinkedIn Sales Navigator 2026-04-22"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Domain (optional)
                  </span>
                  <input
                    type="text"
                    value={newLeadDraft.domain}
                    onChange={(e) => setNewLeadDraft((d) => ({ ...d, domain: e.target.value }))}
                    placeholder="siemens.com"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Branche (optional)
                  </span>
                  <input
                    type="text"
                    value={newLeadDraft.industry}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, industry: e.target.value }))
                    }
                    placeholder="z. B. Automobilzulieferer"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Segment (optional)
                  </span>
                  <input
                    type="text"
                    value={newLeadDraft.market_segment}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, market_segment: e.target.value }))
                    }
                    placeholder="z. B. Enterprise / KMU"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Zentrale (optional)
                  </span>
                  <input
                    type="text"
                    value={newLeadDraft.hq_location}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, hq_location: e.target.value }))
                    }
                    placeholder="z. B. München"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Mitarbeiter (optional)
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newLeadDraft.employee_count}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, employee_count: e.target.value }))
                    }
                    placeholder="z. B. 12500"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Umsatz EUR (optional)
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newLeadDraft.revenue_eur}
                    onChange={(e) =>
                      setNewLeadDraft((d) => ({ ...d, revenue_eur: e.target.value }))
                    }
                    placeholder="z. B. 5000000000"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Notizen (optional)
                  </span>
                  <textarea
                    value={newLeadDraft.notes}
                    onChange={(e) => setNewLeadDraft((d) => ({ ...d, notes: e.target.value }))}
                    placeholder="Kontext, Gesprächsleitfaden, Rechercheergebnisse…"
                    rows={3}
                    className="resize-y rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
              </div>
              <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-[#5a5a5a]">
                * Pflichtfelder. Auto-Research füllt Pain Points und Hooks im Hintergrund nach.
              </p>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-[#1a1a1a] px-5 py-4">
              <button
                type="button"
                onClick={() => !newLeadSaving && setNewLeadOpen(false)}
                className="rounded-md border border-[#1f1f1f] bg-[#080808] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={newLeadSaving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void submitNewLead()}
                disabled={newLeadSaving}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/12 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e8dcb8] transition hover:bg-[#c9a962]/18 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {newLeadSaving ? "Speichert…" : "Lead anlegen"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {quickLead ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !quickSaving) {
              setQuickLead(null);
            }
          }}
        >
          <div className="mt-8 w-full max-w-2xl rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#1a1a1a] px-5 py-4">
              <div>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#d4d4d4]">
                  Quick-Edit · {quickLead.company_name}
                </h3>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5a5a]">
                  Stammdaten + Notizen aktualisieren
                </p>
              </div>
              <button
                type="button"
                onClick={() => !quickSaving && setQuickLead(null)}
                className="rounded-md border border-[#1f1f1f] bg-[#080808] p-1.5 text-[#6b6b6b] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={quickSaving}
                aria-label="Schließen"
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </header>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Konzernname
                  </span>
                  <input
                    type="text"
                    value={quickDraft.corporate_group_name}
                    onChange={(e) =>
                      setQuickDraft((d) => ({ ...d, corporate_group_name: e.target.value }))
                    }
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Standort
                  </span>
                  <input
                    type="text"
                    value={quickDraft.location_name}
                    onChange={(e) =>
                      setQuickDraft((d) => ({ ...d, location_name: e.target.value }))
                    }
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Manager-Name
                  </span>
                  <input
                    type="text"
                    value={quickDraft.manager_name}
                    onChange={(e) =>
                      setQuickDraft((d) => ({ ...d, manager_name: e.target.value }))
                    }
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Kontakt-E-Mail
                  </span>
                  <input
                    type="email"
                    value={quickDraft.contact_email}
                    onChange={(e) =>
                      setQuickDraft((d) => ({ ...d, contact_email: e.target.value }))
                    }
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    LinkedIn-URL
                  </span>
                  <input
                    type="url"
                    value={quickDraft.linkedin_url}
                    onChange={(e) =>
                      setQuickDraft((d) => ({ ...d, linkedin_url: e.target.value }))
                    }
                    placeholder="https://www.linkedin.com/in/…"
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Telefon
                  </span>
                  <input
                    type="tel"
                    value={quickDraft.phone}
                    onChange={(e) => setQuickDraft((d) => ({ ...d, phone: e.target.value }))}
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Abteilung / Funktion
                  </span>
                  <input
                    type="text"
                    value={quickDraft.department}
                    onChange={(e) => setQuickDraft((d) => ({ ...d, department: e.target.value }))}
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Quelle der Recherche
                  </span>
                  <input
                    type="text"
                    value={quickDraft.research_source}
                    onChange={(e) =>
                      setQuickDraft((d) => ({ ...d, research_source: e.target.value }))
                    }
                    className="rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Notizen
                  </span>
                  <textarea
                    value={quickDraft.notes}
                    onChange={(e) => setQuickDraft((d) => ({ ...d, notes: e.target.value }))}
                    rows={4}
                    className="resize-y rounded-md border border-[#1f1f1f] bg-[#050505] px-3 py-2 font-mono text-[12px] text-[#e8e8e8] placeholder-[#3a3a3a] focus:border-[#c9a962]/45 focus:outline-none"
                  />
                </label>
              </div>
              {quickStatus ? (
                <p className="mt-3 font-mono text-[10px] text-[#a8d080]">{quickStatus}</p>
              ) : null}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-[#1a1a1a] px-5 py-4">
              <button
                type="button"
                onClick={() => !quickSaving && setQuickLead(null)}
                className="rounded-md border border-[#1f1f1f] bg-[#080808] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#2a2a2a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={quickSaving}
              >
                Schließen
              </button>
              <button
                type="button"
                onClick={() => void saveQuickNotes()}
                disabled={quickSaving}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/12 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e8dcb8] transition hover:bg-[#c9a962]/18 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {quickSaving ? "Speichert…" : "Speichern"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

