"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { Sparkles, Send, Loader2, ExternalLink } from "lucide-react";
import { askAxonAi, type AxonAiAssistantResponse } from "./actions";

type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; cards?: AxonAiAssistantResponse["cards"] };

const makeId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;

export default function AxonAiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: "assistant",
      content:
        "Ich bin AXON AI. Frag mich z. B.: „Welche Maschinen hatten im März Probleme mit dem Lager?“",
      cards: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    const q = input.trim();
    setInput("");
    setError(null);

    const userMsg: ChatMessage = { id: makeId(), role: "user", content: q };
    setMessages((m) => [...m, userMsg]);
    scrollToBottom();

    setIsSending(true);
    try {
      const res = await askAxonAi(q);
      if (res.error) {
        setError(res.error);
        return;
      }
      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: res.answer || "—",
        cards: res.cards ?? [],
      };
      setMessages((m) => [...m, assistantMsg]);
      scrollToBottom();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Anfrage fehlgeschlagen.";
      setError(msg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
              AXON AI
            </h1>
          </div>
        </div>
        <Link
          href="/dashboard/wartung"
          className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Zur Wartung
        </Link>
      </header>

      <section
        ref={scrollRef}
        className="flex-1 overflow-auto rounded-3xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6"
      >
          <div className="space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[42rem] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "border border-primary/20 bg-primary/10 text-slate-100"
                      : "border border-slate-800 bg-slate-950/40 text-slate-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>

                  {"cards" in m && m.cards && m.cards.length > 0 ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {m.cards.map((c) => (
                        <div
                          key={c.id}
                          className="group rounded-xl border border-slate-800 bg-slate-950/30 p-4 hover:border-primary/30 hover:bg-slate-900/60"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                                {c.type}
                              </p>
                              <p className="mt-2 truncate text-sm font-semibold text-white">
                                {c.title}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-400">
                                {c.url && c.url.length > 0 ? c.url : "Kein Link in der DB hinterlegt"}
                              </p>
                            </div>
                            {c.url && c.url.length > 0 ? (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-primary hover:opacity-90"
                              >
                                <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-primary" />
                              </a>
                            ) : (
                              <ExternalLink className="h-4 w-4 shrink-0 text-slate-600" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={onSubmit}
          className="mt-6 flex items-end gap-3 rounded-3xl border border-slate-800 bg-slate-900/50 p-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            placeholder="Stelle eine Frage…"
            className="min-h-[48px] flex-1 resize-none rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-primary/30"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/20 px-4 text-sm font-semibold text-white transition hover:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Senden
          </button>
        </form>
    </div>
  );
}

