"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCopy, RefreshCw, Sparkles, Trash2 } from "lucide-react";

type ProspectRef = {
  id: string;
  manager_name: string;
  corporate_group_name: string | null;
  location_name: string | null;
};

type ContentItem = {
  id: string;
  created_at: string;
  type: "post" | "comment" | string;
  target_prospect_id: string | null;
  source_post_text: string | null;
  text_draft: string;
  model: string | null;
  is_posted: boolean;
  scheduled_for: string | null;
  posted_at: string | null;
  metadata: unknown;
  prospect?: ProspectRef | null;
};

type PostsApiResponse = {
  items?: ContentItem[];
  error?: string;
};

type ProspectsApiResponse = {
  prospects?: Array<{
    id: string;
    manager_name: string;
    corporate_group_name: string | null;
    location_name: string | null;
  }>;
  error?: string;
};

export function SocialCenterSection() {
  const [subTab, setSubTab] = useState<"posts" | "comments">("posts");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [generatingPost, setGeneratingPost] = useState(false);

  const [connectedProspects, setConnectedProspects] = useState<ProspectRef[]>([]);
  const [commentProspectId, setCommentProspectId] = useState("");
  const [commentPostText, setCommentPostText] = useState("");
  const [generatingComment, setGeneratingComment] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/leadmaschine/social/post?type=${subTab === "posts" ? "post" : "comment"}`;
      const resp = await fetch(url, { credentials: "include" });
      const p = (await resp.json()) as PostsApiResponse;
      if (!resp.ok) {
        setError(p.error ?? "Konnte Social-Content nicht laden.");
        return;
      }
      setItems(p.items ?? []);
    } catch {
      setError("Netzwerkfehler (Social).");
    } finally {
      setLoading(false);
    }
  }, [subTab]);

  const loadConnectedProspects = useCallback(async () => {
    try {
      const resp = await fetch(
        "/api/admin/leadmaschine/prospects?status=connected",
        { credentials: "include" },
      );
      const p = (await resp.json()) as ProspectsApiResponse;
      if (resp.ok && Array.isArray(p.prospects)) {
        setConnectedProspects(
          p.prospects.map((r) => ({
            id: r.id,
            manager_name: r.manager_name,
            corporate_group_name: r.corporate_group_name,
            location_name: r.location_name,
          })),
        );
      }
    } catch {
      // Silent: Connected-Liste ist nur fuer die Dropdown, kein harter Fehler.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadConnectedProspects();
  }, [loadConnectedProspects]);

  const generatePost = async () => {
    setGeneratingPost(true);
    setError(null);
    setStatus(null);
    try {
      const resp = await fetch("/api/admin/leadmaschine/social/post", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const p = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok) {
        setError(p.error ?? "Post-Generierung fehlgeschlagen.");
        return;
      }
      setStatus("Neuer Post-Entwurf generiert.");
      await load();
    } finally {
      setGeneratingPost(false);
    }
  };

  const generateComment = async () => {
    if (!commentProspectId) {
      setError("Bitte einen vernetzten Manager auswählen.");
      return;
    }
    if (commentPostText.trim().length < 40) {
      setError("Post-Text zu kurz (mindestens 40 Zeichen einfügen).");
      return;
    }
    setGeneratingComment(true);
    setError(null);
    setStatus(null);
    try {
      const resp = await fetch("/api/admin/leadmaschine/social/comment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect_id: commentProspectId,
          post_text: commentPostText,
        }),
      });
      const p = (await resp.json()) as { ok?: boolean; error?: string; text_draft?: string };
      if (!resp.ok) {
        setError(p.error ?? "Kommentar-Generierung fehlgeschlagen.");
        return;
      }
      setStatus("Kommentar-Entwurf generiert.");
      setCommentPostText("");
      setSubTab("comments");
      await load();
    } finally {
      setGeneratingComment(false);
    }
  };

  const markPosted = async (it: ContentItem, posted: boolean) => {
    const resp = await fetch(
      `/api/admin/leadmaschine/social/post/${encodeURIComponent(it.id)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: posted ? "mark_posted" : "unmark_posted" }),
      },
    );
    if (!resp.ok) {
      const d = (await resp.json()) as { error?: string };
      setError(d.error ?? "Update fehlgeschlagen.");
      return;
    }
    await load();
  };

  const saveDraft = async (id: string, text: string) => {
    const resp = await fetch(
      `/api/admin/leadmaschine/social/post/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_draft: text }),
      },
    );
    if (!resp.ok) {
      const d = (await resp.json()) as { error?: string };
      setError(d.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    setStatus("Entwurf gespeichert.");
    await load();
  };

  const deleteItem = async (it: ContentItem) => {
    if (!window.confirm("Entwurf endgültig löschen?")) return;
    const resp = await fetch(
      `/api/admin/leadmaschine/social/post/${encodeURIComponent(it.id)}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!resp.ok) {
      const d = (await resp.json()) as { error?: string };
      setError(d.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    await load();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("In die Zwischenablage kopiert.");
    } catch {
      setError("Konnte nicht kopieren (Browser-Rechte prüfen).");
    }
  };

  const counts = useMemo(() => {
    return {
      total: items.length,
      posted: items.filter((i) => i.is_posted).length,
      draft: items.filter((i) => !i.is_posted).length,
    };
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-[14px] font-semibold uppercase tracking-[0.16em] text-[#e4e4e4]">
            KI Social Center
          </h2>
          <p className="mt-1 max-w-3xl font-mono text-[10px] leading-relaxed text-[#6a6a6a]">
            Zwei LinkedIn-Post-Entwürfe pro Woche (automatisch via Cron, Mo + Do) +
            Kommentar-Entwürfe zu Posts vernetzter Manager. Alles manuell zu veröffentlichen
            (Copy to Clipboard → LinkedIn).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" />
          Neu laden
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-[#b8401a]/40 bg-[#b8401a]/[0.08] p-3 font-mono text-[10px] text-[#e9b999]">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="rounded-md border border-[#c9a962]/35 bg-[#c9a962]/[0.06] p-3 font-mono text-[10px] text-[#d4c896]">
          {status}
        </div>
      ) : null}

      {/* Sub-Tabs */}
      <div className="flex flex-wrap gap-2">
        {(["posts", "comments"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSubTab(k)}
            className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
              subTab === k
                ? "border-[#c9a962]/45 bg-[#c9a962]/[0.10] text-[#d4c896]"
                : "border-[#2a2a2a] bg-[#0a0a0a] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
            }`}
          >
            {k === "posts" ? "Posts (vom System)" : "Kommentare (pro Manager)"}
          </button>
        ))}
      </div>

      {subTab === "posts" ? (
        <section className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
                Post-Entwürfe · {counts.total} (Entwürfe {counts.draft} · gepostet {counts.posted})
              </p>
              <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#5a5a5a]">
                Ton: Präsenz, Wissen, Vertrauen – kein Sales. Cron generiert 2x/Woche (Mo + Do 09:00 UTC).
              </p>
            </div>
            <button
              type="button"
              onClick={() => void generatePost()}
              disabled={generatingPost}
              className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/[0.08] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.14] disabled:opacity-50"
            >
              <Sparkles className="size-3.5" />
              {generatingPost ? "Generiere…" : "Neuen Entwurf generieren"}
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#d4c896]">
            Neuen Kommentar-Entwurf generieren
          </p>
          <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#5a5a5a]">
            Wähle einen vernetzten Manager und füge den Original-Post-Text ein.
            (LinkedIn-Scraping ist nicht aktiv – manuelles Einfügen schützt vor Bans.)
          </p>
          <div className="mt-3 grid gap-3">
            <div>
              <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
                Vernetzter Manager
              </label>
              <select
                value={commentProspectId}
                onChange={(e) => setCommentProspectId(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
              >
                <option value="">— auswählen —</option>
                {connectedProspects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.manager_name}
                    {p.corporate_group_name ? ` · ${p.corporate_group_name}` : ""}
                    {p.location_name ? ` (${p.location_name})` : ""}
                  </option>
                ))}
              </select>
              {connectedProspects.length === 0 ? (
                <p className="mt-1 font-mono text-[8px] text-[#6a6a6a]">
                  Noch keine vernetzten Manager. Im Prospects-Tab als „Vernetzt markiert“ setzen.
                </p>
              ) : null}
            </div>
            <div>
              <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
                Original-Post-Text (Copy-Paste von LinkedIn)
              </label>
              <textarea
                rows={6}
                placeholder="Kopiere hier den LinkedIn-Post des Managers rein…"
                value={commentPostText}
                onChange={(e) => setCommentPostText(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 font-mono text-[11px] text-[#d4d4d4] outline-none focus:border-[#c9a962]/40"
              />
              <p className="mt-1 font-mono text-[8px] text-[#6a6a6a]">
                {commentPostText.length} Zeichen (min. 40 für Generierung).
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void generateComment()}
                disabled={
                  generatingComment || !commentProspectId || commentPostText.trim().length < 40
                }
                className="inline-flex items-center gap-2 rounded-md border border-[#c9a962]/45 bg-[#c9a962]/[0.08] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.14] disabled:opacity-50"
              >
                <Sparkles className="size-3.5" />
                {generatingComment ? "Generiere…" : "Kommentar-Entwurf generieren"}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-md border border-[#1a1a1a] bg-[#080808] p-6 text-center font-mono text-[10px] text-[#6a6a6a]">
            Noch keine Einträge.
          </p>
        ) : (
          items.map((it) => <ContentItemCard key={it.id} item={it} onCopy={copyToClipboard} onSaveDraft={saveDraft} onMarkPosted={markPosted} onDelete={deleteItem} />)
        )}
      </section>
    </div>
  );
}

function ContentItemCard(props: {
  item: ContentItem;
  onCopy: (text: string) => Promise<void>;
  onSaveDraft: (id: string, text: string) => Promise<void>;
  onMarkPosted: (it: ContentItem, posted: boolean) => Promise<void>;
  onDelete: (it: ContentItem) => Promise<void>;
}) {
  const { item, onCopy, onSaveDraft, onMarkPosted, onDelete } = props;
  const [draft, setDraft] = useState(item.text_draft);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(item.text_draft);
  }, [item.text_draft]);

  const dateStr = new Date(item.created_at).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      className={`rounded-md border p-4 ${
        item.is_posted
          ? "border-[#c9a962]/30 bg-[#c9a962]/[0.04]"
          : "border-[#1f1f1f] bg-[#080808]"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#c9a962]/30 bg-[#c9a962]/[0.08] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4c896]">
            {item.type === "comment" ? "Kommentar" : "Post"}
          </span>
          {item.is_posted ? (
            <span className="rounded-full border border-[#c9a962]/50 bg-[#c9a962]/[0.12] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#e4d3a0]">
              ✓ gepostet
            </span>
          ) : null}
          {item.prospect ? (
            <span className="font-mono text-[9px] text-[#8a8a8a]">
              {item.prospect.manager_name}
              {item.prospect.corporate_group_name
                ? ` · ${item.prospect.corporate_group_name}`
                : ""}
            </span>
          ) : null}
          <span className="font-mono text-[9px] text-[#5a5a5a]">{dateStr}</span>
          {item.model ? (
            <span className="font-mono text-[9px] text-[#5a5a5a]">{item.model}</span>
          ) : null}
        </div>
        <div className="inline-flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => void onCopy(draft)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4]"
          >
            <ClipboardCopy className="size-3" />
            Kopieren
          </button>
          <button
            type="button"
            onClick={() => void onMarkPosted(item, !item.is_posted)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a962]/40 bg-[#c9a962]/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#d4c896] transition hover:bg-[#c9a962]/[0.12]"
          >
            <CheckCircle2 className="size-3" />
            {item.is_posted ? "Als Entwurf" : "Als gepostet"}
          </button>
          <button
            type="button"
            onClick={() => void onDelete(item)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#b8401a]/35 bg-[#b8401a]/[0.05] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#e9b999] transition hover:bg-[#b8401a]/[0.12]"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </header>

      {item.type === "comment" && item.source_post_text ? (
        <details className="mt-3 rounded-md border border-[#1a1a1a] bg-[#050505] p-2">
          <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a6a6a]">
            Original-Post-Text
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[#8a8a8a]">
            {item.source_post_text}
          </pre>
        </details>
      ) : null}

      <div className="mt-3">
        <textarea
          rows={item.type === "post" ? 10 : 5}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setEditing(true);
          }}
          className="w-full rounded-md border border-[#262626] bg-[#0a0a0a] p-3 font-mono text-[11px] leading-relaxed text-[#e4e4e4] outline-none focus:border-[#c9a962]/40"
        />
        {editing ? (
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(item.text_draft);
                setEditing(false);
              }}
              className="rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8a8a8a]"
            >
              Verwerfen
            </button>
            <button
              type="button"
              onClick={async () => {
                await onSaveDraft(item.id, draft);
                setEditing(false);
              }}
              className="rounded-md border border-[#c9a962]/45 bg-[#c9a962]/[0.08] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#d4c896]"
            >
              Speichern
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
