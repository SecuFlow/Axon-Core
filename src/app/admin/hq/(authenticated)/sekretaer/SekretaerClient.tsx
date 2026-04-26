"use client";

import { useMemo, useRef, useState } from "react";
import { PlaceholderPanel } from "../../_components/PlaceholderPanel";

type VoiceCommandPayload = {
  error?: string;
  ok?: boolean;
  assistant_text?: string;
  action?: string;
  leads_per_month?: number;
};

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<{
    isFinal: boolean;
    0?: { transcript: string };
  }>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export function SekretaerClient() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [assistantText, setAssistantText] = useState(
    "Sag zum Beispiel: Stelle die Leadrate von 50 auf 100.",
  );

  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  const speakText = async (text: string) => {
    try {
      const resp = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      // Keine harte Fehlermeldung: Textantwort bleibt sichtbar.
    }
  };

  const executeVoiceCommand = async (spoken: string) => {
    setProcessing(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/sekretaer/voice-command", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: spoken }),
      });
      const p = (await resp.json()) as VoiceCommandPayload;
      if (!resp.ok) {
        setError(p.error ?? "Befehl konnte nicht verarbeitet werden.");
        return;
      }
      const answer =
        typeof p.assistant_text === "string" && p.assistant_text.trim()
          ? p.assistant_text
          : "Alles klar.";
      setAssistantText(answer);
      await speakText(answer);
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setProcessing(false);
    }
  };

  const startListening = () => {
    if (!supported || listening || processing) return;
    setError(null);

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Speech-to-Text wird in diesem Browser nicht unterstützt.");
      return;
    }

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = "de-DE";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onerror = () => {
      setListening(false);
      setError("Spracherkennung fehlgeschlagen.");
    };
    rec.onend = () => setListening(false);
    rec.onresult = (ev: SpeechRecognitionEventLike) => {
      let finalText = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r?.isFinal) continue;
        finalText += `${r[0]?.transcript ?? ""} `;
      }
      const clean = finalText.trim();
      if (!clean) return;
      setTranscript(clean);
      void executeVoiceCommand(clean);
    };
    rec.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  return (
    <PlaceholderPanel title="Axon‑Sekretär · Voice Control">
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-6">
        <button
          type="button"
          onClick={listening ? stopListening : startListening}
          disabled={!supported || processing}
          className={`inline-flex h-40 w-40 items-center justify-center rounded-full border font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
            listening
              ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100 shadow-[0_0_45px_rgba(16,185,129,0.35)]"
              : "border-[#c9a962]/40 bg-[#c9a962]/12 text-[#e8dcb8] hover:bg-[#c9a962]/18"
          } disabled:cursor-not-allowed disabled:opacity-50`}
          title="Spracheingabe starten/stoppen"
        >
          {processing ? "Verarbeite…" : listening ? "Spricht…" : "Sprechen"}
        </button>

        {!supported ? (
          <p className="font-mono text-[10px] text-red-300">
            Speech-to-Text wird im aktuellen Browser nicht unterstützt.
          </p>
        ) : null}

        <div className="w-full max-w-3xl space-y-3 rounded-md border border-[#1f1f1f] bg-[#080808] p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5a5a]">
            Letzter Sprachbefehl
          </p>
          <p className="min-h-6 font-mono text-[11px] text-[#d4d4d4]">
            {transcript || "—"}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5a5a]">
            Sekretär Antwort
          </p>
          <p className="font-mono text-[11px] text-[#d4d4d4]">{assistantText}</p>
        </div>

        {error ? (
          <div className="w-full max-w-3xl rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[10px] text-red-200">
            {error}
          </div>
        ) : null}
      </div>
    </PlaceholderPanel>
  );
}

