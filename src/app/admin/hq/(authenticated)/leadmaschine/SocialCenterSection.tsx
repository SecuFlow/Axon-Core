"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCopy, RefreshCw, Sparkles, Trash2 } from "lucide-react";

type ContentItem = {
  id: string;
  created_at: string;
  type: "post" | "comment" | string;
  text_draft: string;
  model: string | null;
  is_posted: boolean;
  scheduled_for: string | null;
  posted_at: string | null;
  metadata: unknown;
};

type PostsApiResponse = {
  items?: ContentItem[];
  error?: string;
};

/**
 * Social Center: KI-generierte LinkedIn-Posts.
 *
 * Comment-Drafts auf Manager-Posts wurden mit dem Apollo-Pivot eingestellt
 * (frueher an linkedin_prospects gekoppelt). Falls man Comments wieder
 * braucht, kann man sie spaeter auf Apollo-Leads aufbauen.
 */
export function SocialCenterSection() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [generatingPost, setGeneratingPost] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/leadmaschine/social/post", {
        credentials: "include",
      });
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
            Zwei LinkedIn-Post-Entwürfe pro Woche (automatisch via Cron, Mo + Do).
            Manuell zu veröffentlichen (Copy to Clipboard → LinkedIn).
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

      <section className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-md border border-[#1a1a1a] bg-[#080808] p-6 text-center font-mono text-[10px] text-[#6a6a6a]">
            Noch keine Einträge.
          </p>
        ) : (
          items.map((it) => (
            <ContentItemCard
              key={it.id}
              item={it}
              onCopy={copyToClipboard}
              onSaveDraft={saveDraft}
              onMarkPosted={markPosted}
              onDelete={deleteItem}
            />
          ))
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
            Post
          </span>
          {item.is_posted ? (
            <span className="rounded-full border border-[#c9a962]/50 bg-[#c9a962]/[0.12] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#e4d3a0]">
              ✓ gepostet
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

      <div className="mt-3">
        <textarea
          rows={10}
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
