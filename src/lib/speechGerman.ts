/**
 * Browser-TTS (speechSynthesis). Auf iOS/Safari nur zuverlässig innerhalb
 * einer direkten Nutzeraktion (Tap/Click) — nicht aus useEffect oder nach async Callbacks.
 */

function pickGermanVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const list = window.speechSynthesis.getVoices();
  return (
    list.find((v) => {
      const l = (v.lang ?? "").toLowerCase();
      return l === "de-de" || l.startsWith("de-");
    }) ??
    list.find((v) => /deutsch|german/i.test(v.name)) ??
    null
  );
}

let voicesListenerAttached = false;

function ensureVoicesLoaded(): void {
  if (typeof window === "undefined" || voicesListenerAttached) return;
  voicesListenerAttached = true;
  const synth = window.speechSynthesis;
  const noop = () => {};
  synth.addEventListener("voiceschanged", noop);
  try {
    void synth.getVoices();
  } catch {
    /* ignore */
  }
}

/**
 * Spricht deutsch. Sollte aus einem click/touch-Handler aufgerufen werden (mobil).
 */
export function speakGermanTts(text: string): void {
  if (typeof window === "undefined") return;
  const t = text.trim();
  if (!t) return;

  ensureVoicesLoaded();
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
  } catch {
    /* ignore */
  }
  try {
    synth.resume();
  } catch {
    /* ignore */
  }

  const u = new SpeechSynthesisUtterance(t);
  u.lang = "de-DE";
  const voice = pickGermanVoice();
  if (voice) {
    u.voice = voice;
  }
  u.rate = 0.92;
  u.pitch = 1;
  u.volume = 1;
  u.onerror = (e) => {
    console.warn("[speechGerman] synthesis error:", e.error, e);
  };

  try {
    synth.speak(u);
  } catch (e) {
    console.warn("[speechGerman] speak failed:", e);
  }
}

export async function speakGermanViaServerTts(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const t = text.trim();
  if (!t) return false;
  try {
    const resp = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t }),
    });
    if (!resp.ok) return false;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.preload = "auto";
    try {
      await audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      return true;
    } catch {
      URL.revokeObjectURL(url);
      return false;
    }
  } catch {
    return false;
  }
}
