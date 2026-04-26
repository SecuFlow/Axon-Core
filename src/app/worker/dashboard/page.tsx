"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Camera, Mic, Volume2, X } from "lucide-react";
import { compressImageForUpload } from "@/lib/compressWorkerImage";
import {
  clearOfflineReportsQueue,
  dataUrlToFile,
  enqueuePendingVoiceSync,
  filesToDataUrls,
  getOfflineReportsQueue,
  getPendingVoiceQueue,
  queueOfflineReport,
  removeOfflineReportById,
  removePendingVoiceById,
} from "@/lib/workerOfflineReports";
import { WORKER_VOICE_COPY } from "@/lib/workerVoiceCopy";
import { speakGermanTts, speakGermanViaServerTts } from "@/lib/speechGerman";
import {
  resolveWorkerBranding,
  type ProfileMeResponse,
} from "@/lib/workerBranding";
import {
  type ClientBranding,
  applyBrandPrimaryToDom,
  useBranding,
  writeBrandingToSessionStorage,
} from "@/components/branding/useBranding";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoUpgradeCta } from "@/components/DemoUpgradeCta";
import { DEFAULT_BRAND_PRIMARY } from "@/lib/brandTheme";
import { useDemoLinkParam } from "@/lib/useDemoLinkParam";
const DSGVO_CONFIRMATION_KEY = "worker_dsgvo_confirmed_v1";

/** Platzhalter bis Whisper/KI im Hintergrund nachliefert */
const PLACEHOLDER_MACHINE = "Wird aus der Spracheingabe übernommen …";
const PLACEHOLDER_ISSUE = "Wird aus der Spracheingabe übernommen …";

export type VoiceCurrentStep =
  | "idle"
  | "ask_machine_name"
  | "ask_issue"
  | "ask_photo"
  | "complete";

export default function WorkerDashboardPage() {
  const demoParam = useDemoLinkParam();
  const brandingFromHook = useBranding();
  const [demoMachines, setDemoMachines] = useState<
    Array<{ id: string; name: string | null; serial_number: string; status: string }>
  >([]);
  const [demoCheckMsg, setDemoCheckMsg] = useState<string | null>(null);
  const [demoCheckInId, setDemoCheckInId] = useState<string | null>(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(true);
  const [isDsgvoConfirmed, setIsDsgvoConfirmed] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPressed, setIsRecordingPressed] = useState(false);
  const [reportCategory, setReportCategory] = useState<
    "maschinenfehler" | "prozessoptimierung" | "sicherheitsrisiko" | ""
  >("");
  const [photoItems, setPhotoItems] = useState<
    Array<{ id: string; file: File; url: string }>
  >([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [solutionSteps, setSolutionSteps] = useState<string[]>([]);
  const [originalPriority, setOriginalPriority] = useState<"1" | "2" | "3" | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (demoParam) {
          const mResp = await fetch(
            `/api/wartung/machines?demo=${encodeURIComponent(demoParam)}&t=${Date.now()}`,
            { cache: "no-store" },
          );
          type MachineDto = {
            id: unknown;
            name?: string | null;
            serial_number?: unknown;
            status?: unknown;
          };
          const mp = (await mResp.json()) as { machines?: MachineDto[] };
          if (!cancelled) {
            setDemoMachines(
              (mp.machines ?? []).map((m) => ({
                id: String(m.id),
                name: m.name ?? null,
                serial_number: String(m.serial_number ?? ""),
                status: String(m.status ?? ""),
              })),
            );
          }
          return;
        }
        const resp = await fetch("/api/profile/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!resp.ok) return;
        const payload = (await resp.json()) as ProfileMeResponse;
        if (cancelled) return;
        const next = resolveWorkerBranding(payload);
        applyBrandPrimaryToDom(next.primary_color);
        writeBrandingToSessionStorage({
          logo_url: next.logo_url,
          primary_color: next.primary_color,
        });
        window.dispatchEvent(
          new CustomEvent<ClientBranding>("axon:branding", {
            detail: {
              logo_url: next.logo_url,
              primary_color: next.primary_color,
            },
          }),
        );
      } catch {
        /* Profil optional */
      }
    };

    void load();

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    const t = window.setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(t);
    };
  }, [demoParam]);

  const companyPrimary = brandingFromHook.primary_color ?? null;

  const uiPrimary = companyPrimary ?? DEFAULT_BRAND_PRIMARY;

  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const s = hex.trim().replace("#", "");
    if (!/^[0-9a-fA-F]{3}$/.test(s) && !/^[0-9a-fA-F]{6}$/.test(s)) return null;
    const full =
      s.length === 3 ? `${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}` : s;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const rgb = hexToRgb(uiPrimary);
  const glow40 = rgb ? `0 0 40px rgba(${rgb.r},${rgb.g},${rgb.b},0.30)` : undefined;
  const glow35 = rgb ? `0 0 35px rgba(${rgb.r},${rgb.g},${rgb.b},0.28)` : undefined;
  const [priorityOverride, setPriorityOverride] = useState<"1" | "2" | "3" | null>(
    null,
  );
  const [caseId, setCaseId] = useState<string | null>(null);
  const [prioritySaveMessage, setPrioritySaveMessage] = useState<string | null>(
    null,
  );
  const [knowledgeSyncInfo, setKnowledgeSyncInfo] = useState<string | null>(null);
  const [offlineSyncInfo, setOfflineSyncInfo] = useState<string | null>(null);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);
  const [isFlushingVoice, setIsFlushingVoice] = useState(false);
  const [isOptimizingPhoto, setIsOptimizingPhoto] = useState(false);
  const [isSavingPriority, setIsSavingPriority] = useState(false);

  const [currentStep, setCurrentStep] = useState<VoiceCurrentStep>("idle");
  const [machineName, setMachineName] = useState<string | null>(null);
  const [issueDescription, setIssueDescription] = useState<string | null>(null);
  /** iOS: TTS nur nach echtem Tap — erst „Assistent starten“, dann Mikro. */
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);

  const currentStepRef = useRef<VoiceCurrentStep>("idle");
  const voiceBootstrapDoneRef = useRef(false);
  /** Feld für Hintergrund-Sync: gesetzt im Tap vor recorder.stop(), gelesen in onstop */
  const pendingSyncFieldRef = useRef<"machine_name" | "issue_description" | null>(
    null,
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const photoItemsRef = useRef(photoItems);
  const recordingPressActiveRef = useRef(false);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    const confirmed = window.localStorage.getItem(DSGVO_CONFIRMATION_KEY) === "1";
    setIsDsgvoConfirmed(confirmed);
    setIsCheckingStorage(false);
  }, []);

  useEffect(() => {
    photoItemsRef.current = photoItems;
  }, [photoItems]);

  useEffect(() => {
    return () => {
      photoItemsRef.current.forEach((i) => URL.revokeObjectURL(i.url));
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const isOverlayVisible = useMemo(
    () => isCheckingStorage || !isDsgvoConfirmed,
    [isCheckingStorage, isDsgvoConfirmed],
  );

  /** Server-Ping nur für Session — keine Sprache (iOS blockiert TTS aus useEffect). */
  useEffect(() => {
    if (isOverlayVisible) return;
    if (voiceBootstrapDoneRef.current) return;
    voiceBootstrapDoneRef.current = true;
    void fetch("/api/ai/worker-voice-step", {
      method: "POST",
      body: (() => {
        const fd = new FormData();
        fd.set("action", "init");
        return fd;
      })(),
    }).catch(() => {});
  }, [isOverlayVisible]);

  const handleStartVoiceSession = () => {
    setVoiceSessionActive(true);
    setCurrentStep("ask_machine_name");
    void (async () => {
      const ok = await speakGermanViaServerTts(WORKER_VOICE_COPY.askMachine);
      if (!ok) speakGermanTts(WORKER_VOICE_COPY.askMachine);
    })();
  };

  const handleConfirm = () => {
    window.localStorage.setItem(DSGVO_CONFIRMATION_KEY, "1");
    setIsDsgvoConfirmed(true);
  };

  const createId = () =>
    `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
      .toString(16)
      .slice(2)}`;

  type VoiceStepPayload = {
    transcript?: string;
    status?: string;
    machine_name?: string;
    issue_description?: string;
    error?: string;
  };

  const applyVoiceStepPayload = useCallback(
    (p: VoiceStepPayload, field: "machine_name" | "issue_description") => {
      if (typeof p.transcript === "string") {
        console.log("User sprach:", p.transcript);
      }
      console.log("KI Analyse Ergebnis:", p);
      if (p.status === "advance") {
        if (field === "machine_name" && p.machine_name?.trim()) {
          setMachineName(p.machine_name.trim());
        }
        if (field === "issue_description" && p.issue_description?.trim()) {
          setIssueDescription(p.issue_description.trim());
        }
      }
    },
    [],
  );

  const syncVoiceToServer = useCallback(
    async (blob: Blob, field: "machine_name" | "issue_description") => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          await enqueuePendingVoiceSync(field, blob);
        } catch {
          /* IndexedDB */
        }
        return;
      }
      const fd = new FormData();
      fd.set("action", "answer");
      fd.set("step", field);
      fd.set("audio", new File([blob], "voice.webm", { type: "audio/webm" }));
      try {
        const resp = await fetch("/api/ai/worker-voice-step", {
          method: "POST",
          body: fd,
        });
        const p = (await resp.json()) as VoiceStepPayload;
        if (!resp.ok) return;
        applyVoiceStepPayload(p, field);
      } catch {
        /* lokaler Ablauf bleibt gültig */
      }
    },
    [applyVoiceStepPayload],
  );

  const voiceFlushLockRef = useRef(false);
  const flushPendingVoiceFromIdb = useCallback(async () => {
    if (voiceFlushLockRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const pending = await getPendingVoiceQueue();
    if (pending.length === 0) return;
    voiceFlushLockRef.current = true;
    setIsFlushingVoice(true);
    try {
      for (const item of pending) {
        const fd = new FormData();
        fd.set("action", "answer");
        fd.set("step", item.field);
        fd.set(
          "audio",
          new File([item.audioBlob], "voice.webm", {
            type: item.mimeType || "audio/webm",
          }),
        );
        try {
          const resp = await fetch("/api/ai/worker-voice-step", {
            method: "POST",
            body: fd,
          });
          const p = (await resp.json()) as VoiceStepPayload;
          if (!resp.ok) continue;
          applyVoiceStepPayload(p, item.field);
          await removePendingVoiceById(item.id);
        } catch {
          break;
        }
      }
    } finally {
      voiceFlushLockRef.current = false;
      setIsFlushingVoice(false);
    }
  }, [applyVoiceStepPayload]);

  const startRecording = async () => {
    if (!voiceSessionActive || isOverlayVisible || isRecording) return;
    const step = currentStepRef.current;
    if (step !== "ask_machine_name" && step !== "ask_issue") return;

    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      pendingSyncFieldRef.current = null;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const completeBlob = new Blob(chunksRef.current, {
          type: "audio/webm",
        });

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        mediaRecorderRef.current = null;
        chunksRef.current = [];
        setIsRecording(false);
        setIsRecordingPressed(false);
        recordingPressActiveRef.current = false;

        if (completeBlob.size === 0) {
          pendingSyncFieldRef.current = null;
          return;
        }

        const field = pendingSyncFieldRef.current;
        pendingSyncFieldRef.current = null;
        if (field) {
          void syncVoiceToServer(completeBlob, field).catch(() => {});
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      setIsRecordingPressed(false);
      recordingPressActiveRef.current = false;
      setMediaError(
        "Mikrofonzugriff wurde verweigert oder ist auf diesem Gerät nicht verfügbar.",
      );
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  };

  const finishRecordingStep = () => {
    const stepAtStop = currentStepRef.current;
    if (stepAtStop === "ask_machine_name") {
      pendingSyncFieldRef.current = "machine_name";
      void (async () => {
        const ok = await speakGermanViaServerTts(WORKER_VOICE_COPY.ackStep1To2);
        if (!ok) speakGermanTts(WORKER_VOICE_COPY.ackStep1To2);
      })();
      setMachineName(PLACEHOLDER_MACHINE);
      setCurrentStep("ask_issue");
    } else if (stepAtStop === "ask_issue") {
      pendingSyncFieldRef.current = "issue_description";
      void (async () => {
        const ok = await speakGermanViaServerTts(WORKER_VOICE_COPY.ackStep2To3);
        if (!ok) speakGermanTts(WORKER_VOICE_COPY.ackStep2To3);
      })();
      setIssueDescription(PLACEHOLDER_ISSUE);
      setCurrentStep("ask_photo");
    }
    stopRecording();
    setIsRecordingPressed(false);
    recordingPressActiveRef.current = false;
  };

  const handleRecordPressStart = async () => {
    if (isOverlayVisible || !micInteractive || isRecording) return;
    setIsRecordingPressed(true);
    recordingPressActiveRef.current = true;
    await startRecording();
  };

  const handleRecordPressEnd = () => {
    if (!recordingPressActiveRef.current) return;
    if (isRecording) {
      finishRecordingStep();
    } else {
      setIsRecordingPressed(false);
      recordingPressActiveRef.current = false;
    }
  };

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsOptimizingPhoto(true);
    try {
      const nextItems: Array<{ id: string; file: File; url: string }> = [];
      for (let idx = 0; idx < files.length; idx++) {
        const raw = files[idx];
        const id = createId();
        const file = await compressImageForUpload(raw);
        nextItems.push({ id, file, url: URL.createObjectURL(file) });
      }

      setPhotoItems((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.url));
        return nextItems;
      });
      setMediaError(null);
    } catch {
      setMediaError("Foto konnte nicht verarbeitet werden.");
    } finally {
      event.target.value = "";
      setIsOptimizingPhoto(false);
    }
  };

  const handleDeletePhoto = (id: string) => {
    setPhotoItems((prev) => {
      const found = prev.find((x) => x.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((x) => x.id !== id);
    });
  };

  const canSubmitReport =
    currentStep === "ask_photo" &&
    photoItems.length > 0 &&
    !!machineName?.trim() &&
    !!issueDescription?.trim() &&
    reportCategory !== "" &&
    !isSending &&
    !isOptimizingPhoto &&
    !isOverlayVisible;

  const syncOfflineReports = useCallback(async () => {
    if (isSyncingOffline) return;
    const queue = await getOfflineReportsQueue();
    if (queue.length === 0) return;
    setIsSyncingOffline(true);
    setOfflineSyncInfo(null);
    let synced = 0;
    for (const item of queue) {
      try {
        const formData = new FormData();
        formData.set("sequential_flow", "1");
        formData.set("sequential_machine_name", item.machineName);
        formData.set("sequential_issue", item.issueDescription);
        if (item.category) formData.set("sequential_category", item.category);
        item.photoDataUrls.slice(0, 5).forEach((url, idx) => {
          const file = dataUrlToFile(url, `offline-${item.id}-${idx + 1}.jpg`);
          if (file) formData.append("photo", file, file.name);
        });
        const resp = await fetch("/api/ai/analyze", {
          method: "POST",
          body: formData,
        });
        if (!resp.ok) continue;
        await removeOfflineReportById(item.id);
        synced += 1;
      } catch {
        // warten bis nächste Verbindung stabil ist
      }
    }
    setOfflineSyncInfo(
      synced > 0
        ? `${synced} Offline-Bericht(e) synchronisiert.`
        : "Offline-Sync wartet auf stabile Verbindung.",
    );
    setIsSyncingOffline(false);
  }, [isSyncingOffline]);

  useEffect(() => {
    void syncOfflineReports();
    const onOnline = () => {
      void syncOfflineReports();
      void flushPendingVoiceFromIdb();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [syncOfflineReports, flushPendingVoiceFromIdb]);

  useEffect(() => {
    void flushPendingVoiceFromIdb();
  }, [flushPendingVoiceFromIdb]);

  const handleFinalSend = async () => {
    if (!canSubmitReport || !machineName || !issueDescription) return;
    const normalizedCategory = reportCategory;
    const issueWithCategory = `${issueDescription.trim()}\nKategorie: ${normalizedCategory}`;

    const displayRaw =
      machineName.trim() || issueDescription.trim() || "die Maschine";
    const closingText = `Danke, der Bericht für ${displayRaw} wurde gespeichert.`;

    setCurrentStep("complete");
    void (async () => {
      const ok = await speakGermanViaServerTts(closingText);
      if (!ok) speakGermanTts(closingText);
    })();

    const photoFiles = photoItems.map((i) => i.file);
    let photoDataUrls: string[] = [];
    try {
      photoDataUrls = await filesToDataUrls(photoFiles);
    } catch {
      photoDataUrls = [];
    }

    setIsSending(true);
    setAnalyzeError(null);
    setSolutionSteps([]);
    setOriginalPriority(null);
    setPriorityOverride(null);
    setCaseId(null);
    setPrioritySaveMessage(null);
    setAnalysisText(null);
    setKnowledgeSyncInfo(null);

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          await queueOfflineReport({
            machineName: machineName.trim(),
            issueDescription: issueWithCategory,
            category: normalizedCategory,
            photoDataUrls,
            httpError: "offline",
          });
          setAnalyzeError(null);
          setOfflineSyncInfo(
            "Bericht offline gespeichert. Wird synchronisiert, sobald die Verbindung steht.",
          );
        } catch {
          setAnalyzeError(
            "Bericht konnte lokal nicht gespeichert werden. Bitte erneut versuchen.",
          );
        }
        return;
      }

      const formData = new FormData();
      formData.set("sequential_flow", "1");
      formData.set("sequential_machine_name", machineName.trim());
      formData.set("sequential_issue", issueWithCategory);
      formData.set("sequential_category", normalizedCategory);
      for (const item of photoItems) {
        formData.append("photo", item.file, item.file.name);
      }

      const resp = await fetch("/api/ai/analyze", {
        method: "POST",
        body: formData,
      });

      const payload: {
        error?: string;
        analysis_text?: string;
        priority?: string;
        priority_level?: number;
        solution_steps?: string[];
        case_id?: string | null;
        machine_display_name?: string | null;
        warning?: string;
      } = await resp.json();

      if (!resp.ok) {
        setAnalyzeError(payload.error ?? "Analyse konnte nicht durchgeführt werden.");
        await queueOfflineReport({
          machineName: machineName.trim(),
          issueDescription: issueWithCategory,
          category: normalizedCategory,
          photoDataUrls,
          httpError: payload.error ?? `HTTP ${resp.status}`,
        });
        return;
      }

      setAnalysisText(payload.analysis_text ?? "Keine Analyse verfügbar.");
      setSolutionSteps(payload.solution_steps ?? []);
      const level =
        payload.priority_level === 1 ||
        payload.priority_level === 2 ||
        payload.priority_level === 3
          ? (String(payload.priority_level) as "1" | "2" | "3")
          : payload.priority === "Hoch"
            ? "1"
            : payload.priority === "Mittel"
              ? "2"
              : payload.priority === "Niedrig"
                ? "3"
                : null;
      setOriginalPriority(level);
      setPriorityOverride(level);
      setCaseId(payload.case_id ?? null);

      if (payload.case_id) {
        await clearOfflineReportsQueue();
      } else {
        await queueOfflineReport({
          machineName: machineName.trim(),
          issueDescription: issueWithCategory,
          category: normalizedCategory,
          photoDataUrls,
          analysisText: payload.analysis_text ?? null,
          priorityLevel:
            payload.priority_level != null
              ? String(payload.priority_level)
              : null,
          warning: payload.warning ?? "Kein case_id (Speichern fehlgeschlagen?)",
        });
      }

      if (payload.case_id) {
        try {
          const knowledgeContent = [
            `Maschine: ${machineName.trim()}`,
            `Problem: ${issueDescription.trim()}`,
            `Analyse: ${payload.analysis_text ?? "—"}`,
          ].join("\n");
          const shareResp = await fetch("/api/coin/healing-knowledge", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              case_id: payload.case_id,
              content: knowledgeContent,
            }),
          });
          const sharePayload = (await shareResp.json()) as {
            message?: string;
            rewarded?: boolean;
            pending_manager_approval?: boolean;
            error?: string;
          };
          if (!shareResp.ok) {
            setKnowledgeSyncInfo(
              sharePayload.error ?? "Wissens-Sync konnte nicht abgeschlossen werden.",
            );
          } else if (sharePayload.rewarded) {
            setKnowledgeSyncInfo(
              "Wissen freigegeben und AXN-Belohnung gutgeschrieben.",
            );
          } else if (sharePayload.pending_manager_approval) {
            setKnowledgeSyncInfo(
              sharePayload.message ??
                "Wissen wartet auf Manager-Freigabe für öffentliche Axon AI.",
            );
          } else {
            setKnowledgeSyncInfo("Wissen erfolgreich synchronisiert.");
          }
        } catch {
          setKnowledgeSyncInfo("Netzwerkfehler beim Wissens-Sync.");
        }
      }
    } catch {
      setAnalyzeError("Netzwerkfehler beim Speichern der Analyse.");
      await queueOfflineReport({
        machineName: machineName.trim(),
        issueDescription: issueWithCategory,
        category: normalizedCategory,
        photoDataUrls,
        httpError: "Netzwerkfehler",
      });
    } finally {
      setIsSending(false);
    }
  };

  const resetSequentialFlow = () => {
    window.speechSynthesis.cancel();
    setVoiceSessionActive(true);
    setPhotoItems((prev) => {
      prev.forEach((i) => URL.revokeObjectURL(i.url));
      return [];
    });
    setMachineName(null);
    setIssueDescription(null);
    setReportCategory("");
    setAnalysisText(null);
    setSolutionSteps([]);
    setOriginalPriority(null);
    setPriorityOverride(null);
    setCaseId(null);
    setPrioritySaveMessage(null);
    setAnalyzeError(null);
    setCurrentStep("ask_machine_name");
    void (async () => {
      const ok = await speakGermanViaServerTts(WORKER_VOICE_COPY.askMachine);
      if (!ok) speakGermanTts(WORKER_VOICE_COPY.askMachine);
    })();
  };

  const savePriorityOverride = async (nextPriority: "1" | "2" | "3") => {
    if (!caseId) return;
    if (!originalPriority) return;

    setIsSavingPriority(true);
    setPrioritySaveMessage(null);
    try {
      const resp = await fetch("/api/ai/priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseId,
          original_priority: originalPriority,
          priority_override: nextPriority,
        }),
      });

      const payload: { error?: string } = await resp.json();
      if (!resp.ok) {
        setPrioritySaveMessage(
          payload.error ?? "Priorität konnte nicht gespeichert werden.",
        );
        return;
      }

      setPrioritySaveMessage("Priorität gespeichert.");
    } finally {
      setIsSavingPriority(false);
    }
  };

  const stepIndex =
    currentStep === "ask_machine_name"
      ? 1
      : currentStep === "ask_issue"
        ? 2
        : currentStep === "ask_photo"
          ? 3
          : 0;

  /** Mikro nur in Schritt 1–2; während Aufnahme muss der Button klickbar bleiben (Stoppen). */
  const micInteractive =
    voiceSessionActive &&
    !isOverlayVisible &&
    (currentStep === "ask_machine_name" || currentStep === "ask_issue");

  return (
    <main className="relative min-h-screen px-6 py-10 text-zinc-100">
      {isSyncingOffline || isFlushingVoice ? (
        <div className="pointer-events-none fixed left-0 right-0 top-14 z-[35] flex justify-center px-4">
          <div
            className="max-w-xl rounded-full border border-white/[0.08] bg-[#0b0b0d]/90 px-5 py-2 text-center text-xs text-zinc-500 shadow-lg backdrop-blur-md"
            role="status"
            aria-live="polite"
          >
            Synchronisiere Daten mit der Cloud...
          </div>
        </div>
      ) : null}
      <DemoBanner />
      <DemoUpgradeCta />
      <section
        className={`mx-auto w-full max-w-4xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ${
          isOverlayVisible ? "pointer-events-none select-none opacity-60 blur-[1px]" : ""
        }`}
      >
        <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white">
          Willkommen im Worker Dashboard
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          Sprachausgabe und Schritte laufen lokal sofort. Upload und KI passieren
          im Hintergrund.
        </p>

        {demoParam && demoMachines.length > 0 ? (
          <div className="mt-8 rounded-xl border border-white/[0.08] bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Interaktive Demo (Demo-User)
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Check-In simulieren — erscheint im Konzern-Dashboard unter „Letzte
              Aktivitäten“.
            </p>
            <div className="mt-3 space-y-2">
              {demoMachines.slice(0, 8).map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm text-zinc-200">
                    <span className="truncate font-medium">
                      {m.name ?? "Maschine"}{" "}
                      <span className="font-normal text-zinc-500">
                        ({m.serial_number})
                      </span>
                    </span>
                    <span className="ml-2 text-xs text-zinc-500">{m.status}</span>
                  </div>
                  <button
                    type="button"
                    disabled={demoCheckInId === m.id}
                    onClick={() => {
                      void (async () => {
                        setDemoCheckInId(m.id);
                        setDemoCheckMsg(null);
                        try {
                          const resp = await fetch(
                            `/api/demo/machine-checkin?demo=${encodeURIComponent(demoParam)}`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ machine_id: m.id }),
                              cache: "no-store",
                            },
                          );
                          const p = (await resp.json()) as { error?: string };
                          if (!resp.ok) {
                            setDemoCheckMsg(p.error ?? "Check-In fehlgeschlagen.");
                            return;
                          }
                          setDemoCheckMsg(
                            `Check-In gesendet: ${m.name ?? m.serial_number} — sichtbar im Konzern-Dashboard.`,
                          );
                        } catch {
                          setDemoCheckMsg("Netzwerkfehler beim Check-In.");
                        } finally {
                          setDemoCheckInId(null);
                        }
                      })();
                    }}
                    className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition hover:opacity-95 disabled:opacity-50"
                    style={{
                      borderColor: uiPrimary,
                      backgroundColor: rgb
                        ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.18)`
                        : undefined,
                      color: "#030304",
                      boxShadow: glow35,
                    }}
                  >
                    {demoCheckInId === m.id ? "Sende…" : "Check-In simulieren"}
                  </button>
                </div>
              ))}
            </div>
            {demoCheckMsg ? (
              <p className="mt-3 text-xs text-zinc-400">{demoCheckMsg}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-10">
          <h2 className="text-lg font-semibold text-white">Bericht aufnehmen</h2>

          {currentStep !== "idle" && currentStep !== "complete" ? (
            <div className="mt-4 flex items-center gap-3 text-sm text-zinc-400">
              <span
                className="rounded-full border px-3 py-1 text-zinc-100"
                style={{
                  borderColor: uiPrimary,
                  backgroundColor: rgb
                    ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`
                    : undefined,
                }}
              >
                Schritt {stepIndex} von 3
              </span>
              {currentStep === "ask_machine_name" ? (
                <span>Maschine / Seriennummer</span>
              ) : null}
              {currentStep === "ask_issue" ? (
                <span>Problem beschreiben</span>
              ) : null}
              {currentStep === "ask_photo" ? <span>Foto</span> : null}
            </div>
          ) : null}

          {!voiceSessionActive && currentStep === "idle" ? (
            <div className="mt-8 flex flex-col items-center gap-4">
              <p className="max-w-md text-center text-sm text-zinc-400">
                Auf dem iPhone muss die Sprachausgabe mit einem Tipp gestartet
                werden. Danach funktionieren Mikro und Ansagen wie gewohnt.
              </p>
              <button
                type="button"
                disabled={isOverlayVisible}
                onClick={handleStartVoiceSession}
                className="inline-flex h-14 min-w-[280px] items-center justify-center gap-2 rounded-full border px-8 text-base font-semibold transition hover:opacity-95 disabled:opacity-40"
                style={{
                  backgroundColor: uiPrimary,
                  borderColor: uiPrimary,
                  color: "#030304",
                  boxShadow: glow40,
                }}
              >
                <Volume2 className="h-5 w-5" />
                Assistent mit Ton starten
              </button>
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center justify-center gap-6 sm:flex-row">
              <button
                type="button"
                disabled={!micInteractive}
                onPointerDown={() => void handleRecordPressStart()}
                onPointerUp={handleRecordPressEnd}
                onPointerLeave={handleRecordPressEnd}
                onPointerCancel={handleRecordPressEnd}
                className={`group inline-flex h-40 w-40 flex-col items-center justify-center gap-3 rounded-full border text-zinc-100 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isRecording
                    ? "border-red-300/70 bg-red-500/30 text-red-100 shadow-[0_0_60px_rgba(239,68,68,0.55)]"
                    : "border-red-500/60 bg-red-700/35 hover:scale-[1.02] hover:bg-red-700/45 shadow-[0_0_55px_rgba(220,38,38,0.45)]"
                }`}
                style={
                  isRecording && isRecordingPressed
                    ? { animation: "worker-record-pulse 1.05s ease-in-out infinite" }
                    : undefined
                }
              >
                <Mic className="h-12 w-12" />
                <span className="text-center text-sm font-semibold">
                  {currentStep === "ask_machine_name" ||
                  currentStep === "ask_issue"
                    ? isRecording
                      ? "Gedrückt halten… loslassen zum Stoppen"
                      : "Gedrückt halten & sprechen"
                    : "Sprache (nur Schritt 1–2)"}
                </span>
              </button>

              <label
                className={`group inline-flex h-40 w-40 flex-col items-center justify-center gap-3 rounded-full border text-zinc-100 transition hover:scale-[1.02] ${
                  isOverlayVisible || currentStep !== "ask_photo" || isOptimizingPhoto
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer hover:bg-white/[0.06]"
                }`}
                style={
                  isOverlayVisible ||
                  currentStep !== "ask_photo" ||
                  isOptimizingPhoto
                    ? undefined
                    : {
                        borderColor: uiPrimary,
                        backgroundColor: rgb
                          ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.14)`
                          : undefined,
                        boxShadow: glow40,
                      }
                }
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple={false}
                  disabled={
                    isOverlayVisible || currentStep !== "ask_photo" || isOptimizingPhoto
                  }
                  onChange={(e) => void handlePhotoSelected(e)}
                  className="hidden"
                />
                <Camera className="h-12 w-12" />
                <span className="text-center text-sm font-semibold">
                  {isOptimizingPhoto ? "Bild wird optimiert…" : "Foto (Schritt 3)"}
                </span>
              </label>
            </div>
          )}

          {currentStep === "ask_photo" || currentStep === "complete" ? (
            <div className="mt-6">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Kategorie
              </label>
              <select
                value={reportCategory}
                onChange={(e) =>
                  setReportCategory(
                    e.target.value as
                      | "maschinenfehler"
                      | "prozessoptimierung"
                      | "sicherheitsrisiko"
                      | "",
                  )
                }
                className="w-full rounded-xl border border-white/[0.14] bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#00D1FF]/60"
              >
                <option value="">Kategorie wählen…</option>
                <option value="maschinenfehler">Maschinenfehler</option>
                <option value="prozessoptimierung">Prozessoptimierung</option>
                <option value="sicherheitsrisiko">Sicherheitsrisiko</option>
              </select>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!canSubmitReport}
            onClick={handleFinalSend}
            className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-full border px-8 text-base font-semibold transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: "#991b1b",
              borderColor: "#ef4444",
              color: "#fee2e2",
              boxShadow: "0 0 35px rgba(239,68,68,0.45)",
            }}
          >
            {isSending ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#030304]/30 border-t-[#030304]" />
                Server verarbeitet im Hintergrund…
              </span>
            ) : (
              "Bericht abschließen & speichern"
            )}
          </button>

          {currentStep === "ask_photo" ? (
            <p className="mt-3 text-center text-xs text-zinc-500">
              Nach dem Foto auf den Button tippen. Die Danksagung kommt sofort per
              Sprache.
            </p>
          ) : null}

          {mediaError ? (
            <p className="mt-4 text-sm text-red-300">{mediaError}</p>
          ) : null}
          {analyzeError ? (
            <p className="mt-4 text-sm text-red-300">{analyzeError}</p>
          ) : null}
          {knowledgeSyncInfo ? (
            <p className="mt-3 text-sm text-zinc-300">{knowledgeSyncInfo}</p>
          ) : null}
          {offlineSyncInfo ? (
            <p className="mt-2 text-xs text-zinc-400">{offlineSyncInfo}</p>
          ) : null}

          {machineName || issueDescription ? (
            <div className="mt-6 rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm text-zinc-300">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Erfasste Angaben
              </p>
              {machineName ? (
                <p className="mt-2">
                  <span className="text-zinc-500">Maschine: </span>
                  {machineName}
                </p>
              ) : null}
              {issueDescription ? (
                <p className="mt-1">
                  <span className="text-zinc-500">Problem: </span>
                  {issueDescription}
                </p>
              ) : null}
              {reportCategory ? (
                <p className="mt-1">
                  <span className="text-zinc-500">Kategorie: </span>
                  {reportCategory === "maschinenfehler"
                    ? "Maschinenfehler"
                    : reportCategory === "prozessoptimierung"
                      ? "Prozessoptimierung"
                      : "Sicherheitsrisiko"}
                </p>
              ) : null}
            </div>
          ) : null}

          {photoItems.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Foto</h2>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {photoItems.map((item) => (
                  <div
                    key={item.id}
                    className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-black/20"
                  >
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(item.id)}
                      aria-label="Foto löschen"
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.16] bg-[#030304]/60 text-white transition hover:bg-[#030304]/80"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt="Fotoaufnahme"
                      className="h-40 w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {analysisText ? (
            <div className="mt-6 rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-5">
              <p className="text-xs uppercase tracking-wide text-emerald-200/90">
                Analyse-Ergebnis
              </p>
              <p className="mt-2 text-sm leading-relaxed text-emerald-100">
                {analysisText}
              </p>

              {solutionSteps.length > 0 ? (
                <div className="mt-5">
                  <p className="text-xs uppercase tracking-wide text-emerald-200/90">
                    Lösungsschritte zur Behebung
                  </p>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-emerald-100">
                    {solutionSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>
              ) : null}

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">
                  Priorität
                </p>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  {(
                    [
                      {
                        level: "1",
                        label: "1",
                        hint: "Hoch",
                        color:
                          "bg-red-500/25 border-red-300/50 text-red-100 shadow-[0_0_35px_rgba(239,68,68,0.25)]",
                      },
                      {
                        level: "2",
                        label: "2",
                        hint: "Mittel",
                        color:
                          "bg-yellow-400/20 border-yellow-200/50 text-yellow-100 shadow-[0_0_35px_rgba(250,204,21,0.22)]",
                      },
                      {
                        level: "3",
                        label: "3",
                        hint: "Niedrig",
                        color:
                          "bg-blue-500/20 border-blue-300/50 text-blue-100 shadow-[0_0_35px_rgba(59,130,246,0.22)]",
                      },
                    ] as const
                  ).map((p) => {
                    const selected = priorityOverride === p.level;
                    const disabled = !caseId || isOverlayVisible || isSavingPriority;
                    return (
                      <button
                        key={p.level}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setPriorityOverride(p.level);
                          savePriorityOverride(p.level);
                        }}
                        className={`relative inline-flex h-20 w-full flex-col items-center justify-center rounded-full border text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          p.color
                        } ${
                          selected
                            ? "border-[5px] ring-2 ring-white/25"
                            : "hover:scale-[1.01] active:scale-[0.99]"
                        }`}
                        aria-pressed={selected}
                      >
                        <span className="text-2xl font-bold leading-none">{p.label}</span>
                        <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-90">
                          {p.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {prioritySaveMessage ? (
                  <p className="mt-2 text-xs text-emerald-200/90">{prioritySaveMessage}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {currentStep === "complete" ? (
            <button
              type="button"
              onClick={resetSequentialFlow}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full border border-white/[0.16] bg-white/[0.06] px-6 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.1]"
            >
              Neuen Bericht starten
            </button>
          ) : null}
        </div>
      </section>

      <style jsx global>{`
        @keyframes worker-record-pulse {
          0% {
            transform: scale(1);
            box-shadow:
              0 0 0 0 rgba(239, 68, 68, 0.55),
              0 0 55px rgba(239, 68, 68, 0.45);
          }
          70% {
            transform: scale(1.03);
            box-shadow:
              0 0 0 18px rgba(239, 68, 68, 0),
              0 0 75px rgba(239, 68, 68, 0.6);
          }
          100% {
            transform: scale(1);
            box-shadow:
              0 0 0 0 rgba(239, 68, 68, 0),
              0 0 55px rgba(239, 68, 68, 0.45);
          }
        }
      `}</style>

      {isOverlayVisible ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030304]/95 px-6">
          <div className="w-full max-w-2xl rounded-2xl border border-white/[0.12] bg-[#0b0b0d] p-8 text-zinc-100 shadow-2xl">
            <h2 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-white">
              DSGVO-Bestätigung erforderlich
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-300">
              Ich bestätige, dass ich die DSGVO-Regeln gelesen habe und dass
              dieses Programm DSGVO-konform ist.
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isCheckingStorage}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full border px-6 text-sm font-semibold text-[#030304] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: uiPrimary,
                borderColor: uiPrimary,
              }}
            >
              Bestätigen
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
