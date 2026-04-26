"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { askPublicAi, type PublicAiCard } from "./publicAiActions";

type Msg =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; cards: PublicAiCard[] };

const makeId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;

export default function PublicAI() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: makeId(),
      role: "assistant",
      content:
        "Ich bin die öffentliche AxonCore KI. Erlaubt sind nur technische Fragen zu Instandsetzung (Heilwissen) und Maschinenwissen.",
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

    setMessages((m) => [...m, { id: makeId(), role: "user", content: q }]);
    scrollToBottom();

    setIsSending(true);
    try {
      const res = await askPublicAi(q);
      setMessages((m) => [
        ...m,
        {
          id: makeId(),
          role: "assistant",
          content: res.answer,
          cards: res.cards ?? [],
        },
      ]);
      scrollToBottom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anfrage fehlgeschlagen.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="w-full rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-zinc-100 sm:p-6">
      <header className="mb-4 flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
          <Sparkles className="h-5 w-5 text-cyan-300" />
        </div>
        <div>
          <p className="font-[family-name:var(--font-syne)] text-lg font-semibold">
            AxonCore Public AI
          </p>
          <p className="text-xs text-zinc-400">
            Nur öffentlich freigegebenes Wissen. Neutral, technisch, faktisch.
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="h-[28rem] overflow-auto rounded-2xl border border-white/10 bg-black/20 p-4"
      >
        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[42rem] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "border border-cyan-400/20 bg-cyan-500/10"
                    : "border border-white/10 bg-white/[0.03]"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>

                {"cards" in m && m.cards.length > 0 ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {m.cards.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-white/10 bg-black/20 p-4"
                      >
                        <p className="text-sm font-semibold text-white">{c.title}</p>
                        {c.subtitle ? (
                          <p className="mt-1 text-xs text-zinc-400">{c.subtitle}</p>
                        ) : null}
                        {c.href ? (
                          <a
                            href={c.href}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-block text-xs font-semibold text-cyan-300 hover:underline"
                          >
                            &Ouml;ffnen
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-4 flex items-end gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
          placeholder="Technische Frage stellen…"
          className="min-h-[48px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-400/30"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/20 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Senden
        </button>
      </form>
    </section>
  );
}

