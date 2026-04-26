import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/openai";
import {
  analyzeWorkerInputWithGpt,
  buildVoicePrompts,
  collectInstructionUtterances,
  mapNlpKeywordsToMachineStatus,
  resolveSerialForInventory,
  type AiPriority,
  type AiPriorityLevel,
} from "@/lib/openai";
import { createClient } from "@supabase/supabase-js";
import { VIDEOS_BUCKET } from "@/lib/supabaseStoragePublic";
import { resolveDefaultLocationIdForUser } from "@/lib/resolveDefaultLocation";

export const runtime = "nodejs";

function priorityLevelToText(level: AiPriorityLevel): AiPriority {
  if (level === 1) return "Hoch";
  if (level === 2) return "Mittel";
  return "Niedrig";
}

async function fileToDataUrl(file: File): Promise<string> {
  const ab = await file.arrayBuffer();
  const b64 = Buffer.from(ab).toString("base64");
  const mime = file.type?.trim() || "application/octet-stream";
  return `data:${mime};base64,${b64}`;
}

function safeFileSegment(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "file";
}

export async function POST(request: NextRequest) {
  try {
    const sanitizeEnv = (value: string | undefined) => {
      if (!value) return undefined;
      return value.replace(/\s/g, "");
    };

    const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase ist nicht konfiguriert." },
        { status: 500 },
      );
    }
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY fehlt." },
        { status: 500 },
      );
    }

    const accessToken = request.cookies.get("sb-access-token")?.value;
    if (!accessToken) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Session ist nicht gueltig." }, { status: 401 });
    }

    const userId = userData.user.id;

    const formData = await request.formData();
    const sequentialFlow = formData.get("sequential_flow") === "1";
    const seqMachine = String(formData.get("sequential_machine_name") ?? "").trim();
    const seqIssue = String(formData.get("sequential_issue") ?? "").trim();
    const seqCategoryRaw = String(formData.get("sequential_category") ?? "")
      .trim()
      .toLowerCase();
    const seqCategory =
      seqCategoryRaw === "maschinenfehler" ||
      seqCategoryRaw === "prozessoptimierung" ||
      seqCategoryRaw === "sicherheitsrisiko"
        ? seqCategoryRaw
        : "";

    const audioEntries = formData.getAll("audio");
    const photoEntries = formData.getAll("photo");

    const audioFiles: File[] = audioEntries
      .map((entry, idx) => {
        if (entry instanceof File && entry.size > 0) return entry;
        if (entry instanceof Blob && entry.size > 0) {
          return new File([entry], `audio-${idx}.webm`, {
            type: entry.type || "audio/webm",
          });
        }
        return null;
      })
      .filter(Boolean) as File[];

    const photoFiles: File[] = photoEntries
      .map((entry) => (entry instanceof File && entry.size > 0 ? entry : null))
      .filter(Boolean) as File[];

    const hasAudio = audioFiles.length > 0;
    const hasPhoto = photoFiles.length > 0;

    if (sequentialFlow) {
      if (!seqMachine || !seqIssue || !hasPhoto) {
        return NextResponse.json(
          {
            error:
              "Sequentieller Bericht: Maschinenname, Problembeschreibung und mindestens ein Foto sind erforderlich.",
          },
          { status: 400 },
        );
      }
    } else if (!hasAudio && !hasPhoto) {
      return NextResponse.json(
        { error: "Keine Eingabedaten empfangen." },
        { status: 400 },
      );
    }

    const transcriptParts: string[] = [];

    if (!sequentialFlow && hasAudio) {
      for (let i = 0; i < audioFiles.length; i++) {
        const audioFile = audioFiles[i];
        try {
          const transcript = await transcribeAudio(audioFile);
          if (transcript) {
            transcriptParts.push(`(#${i + 1}) ${transcript}`);
          } else {
            transcriptParts.push(`(#${i + 1}) Keine Sprache erkannt.`);
          }
        } catch (error) {
          const whisperError =
            error instanceof Error ? error.message : "Unbekannter Whisper-Fehler.";
          transcriptParts.push(
            `(#${i + 1}) Whisper nicht verfuegbar. (${whisperError})`,
          );
        }
      }
    }

    const transcriptText = sequentialFlow
      ? `Maschine: ${seqMachine}\nProblem/Beschreibung: ${seqIssue}${
          seqCategory ? `\nKategorie: ${seqCategory}` : ""
        }`
      : transcriptParts.join("\n");

    const photoDataUrls: string[] = [];
    for (const p of photoFiles.slice(0, 3)) {
      try {
        photoDataUrls.push(await fileToDataUrl(p));
      } catch {
        // Wenn ein einzelnes Bild nicht konvertiert werden kann, soll die Analyse trotzdem laufen.
      }
    }

    // GPT-Analyse (Whisper + GPT)
    let gptPriority: AiPriority = "Mittel";
    let gptPriorityLevel: AiPriorityLevel = 2;
    let analysisText = "Analyse abgeschlossen, aber es liegt kein brauchbarer Inhalt vor.";
    let solutionSteps: string[] = [];
    let analyzeErrorText: string | null = null;
    let voicePrompts: string[] = [];
    let machineStatus: string | null = null;
    let machineNameForDb: string | null = null;
    let gptSerial: string | null = null;

    try {
      const gptResult = await analyzeWorkerInputWithGpt({
        transcriptText,
        photoDataUrls,
      });
      gptPriorityLevel = gptResult.priority_level;
      gptPriority = priorityLevelToText(gptPriorityLevel);
      analysisText = gptResult.analysis_text;
      solutionSteps = gptResult.solution_steps;
      voicePrompts = sequentialFlow ? [] : buildVoicePrompts(gptResult);
      machineStatus = gptResult.machine_status;
      const label = gptResult.extracted_machine_label?.trim();
      machineNameForDb =
        sequentialFlow && seqMachine
          ? seqMachine.slice(0, 500)
          : label && label.length > 0
            ? label.slice(0, 500)
            : null;
      gptSerial = gptResult.extracted_serial_number;
    } catch (err) {
      analyzeErrorText = err instanceof Error ? err.message : "GPT-Analyse fehlgeschlagen.";
      machineStatus = mapNlpKeywordsToMachineStatus(transcriptText);
      if (sequentialFlow && seqMachine) {
        machineNameForDb = seqMachine.slice(0, 500);
      }
    }

    const machineDisplayName =
      machineNameForDb ?? (sequentialFlow ? seqMachine : null) ?? null;

    const speakAloud = sequentialFlow
      ? []
      : collectInstructionUtterances({
          voicePrompts,
          analysisText,
          solutionSteps,
        });

    // Case-Datensatz anlegen (nur fuer Priority-Override; kein Feedback-System)
    const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let profileTenant: string | null = null;
    let profileCompany: string | null = null;

    const profRow = await supabaseService
      .from("profiles")
      .select("tenant_id, company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profRow.error && profRow.data) {
      const pr = profRow.data as {
        tenant_id?: unknown;
        company_id?: unknown;
      };
      profileTenant =
        typeof pr.tenant_id === "string" && pr.tenant_id ? pr.tenant_id : null;
      profileCompany =
        typeof pr.company_id === "string" && pr.company_id ? pr.company_id : null;
    }

    const tenantRes = await supabaseService
      .from("companies")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    const companyRowTenant =
      !tenantRes.error &&
      tenantRes.data &&
      typeof (tenantRes.data as { tenant_id?: unknown }).tenant_id === "string"
        ? (tenantRes.data as { tenant_id: string }).tenant_id
        : null;

    /** profiles.tenant_id → sonst profiles.company_id → sonst companies.tenant_id */
    const tenantId =
      profileTenant ?? profileCompany ?? companyRowTenant ?? null;

    let defaultLocationId: string | null = null;
    if (tenantId) {
      try {
        defaultLocationId = await resolveDefaultLocationIdForUser(
          supabaseService,
          userId,
          tenantId,
        );
      } catch {
        defaultLocationId = null;
      }
    }

    let machineId: string | null = null;
    const serialResolved = resolveSerialForInventory({
      gptSerial,
      machineLabel: machineNameForDb,
      transcriptText,
    });

    if (tenantId && serialResolved) {
      try {
        const statusForMachine =
          (machineStatus ?? "active") as "active" | "maintenance" | "offline";
        const up = await supabaseService
          .from("machines")
          .upsert(
            {
              mandant_id: tenantId,
              company_id: tenantId,
              serial_number: serialResolved,
              name: machineNameForDb ?? serialResolved,
              status: statusForMachine,
              updated_at: new Date().toISOString(),
              ...(defaultLocationId ? { location_id: defaultLocationId } : {}),
            },
            { onConflict: "company_id,serial_number" },
          )
          .select("id")
          .single();

        const mid = up.data as { id?: string } | null;
        if (!up.error && mid?.id) {
          machineId = mid.id;
        }
      } catch {
        // Inventar-Tabelle fehlt oder Upsert nicht moeglich
      }
    }

    const uploadedPhotoUrls: string[] = [];
    for (const file of photoFiles.slice(0, 5)) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const segment = safeFileSegment(file.name || "photo.jpg");
        const objectPath = `worker/photos/${userId}/${Date.now()}-${segment}`;
        const contentType = file.type?.trim() || "image/jpeg";

        const { error: upErr } = await supabaseService.storage
          .from(VIDEOS_BUCKET)
          .upload(objectPath, buffer, { contentType, upsert: false });

        if (upErr) continue;

        const { data: pub } = supabaseService.storage
          .from(VIDEOS_BUCKET)
          .getPublicUrl(objectPath);
        if (pub?.publicUrl) {
          uploadedPhotoUrls.push(pub.publicUrl);
        }
      } catch {
        // ignore
      }
    }

    const insertBase = {
      user_id: userId,
      analysis_text: analysisText,
      solution_steps: solutionSteps.length ? solutionSteps : [],
      original_priority: String(gptPriorityLevel),
      priority_override: JSON.stringify({
        original: String(gptPriorityLevel),
        override: String(gptPriorityLevel),
      }),
      ...(machineNameForDb ? { machine_name: machineNameForDb } : {}),
      ...(machineStatus ? { machine_status: machineStatus } : {}),
      manager_public_approved: false,
      ...(machineId ? { machine_id: machineId } : {}),
      ...(tenantId
        ? { company_id: tenantId, tenant_id: tenantId, mandant_id: tenantId }
        : {}),
    } as Record<string, unknown>;

    const insertWithPhotos = {
      ...insertBase,
      photo_urls: uploadedPhotoUrls.length ? JSON.stringify(uploadedPhotoUrls) : JSON.stringify([]),
    };

    const firstInsert = await supabaseService
      .from("ai_cases")
      .insert(insertWithPhotos)
      .select("id")
      .single();

    let inserted = firstInsert.data as { id: string } | null;
    let insertError = firstInsert.error;

    if (insertError?.message?.includes("column ai_cases.photo_urls does not exist")) {
      const fallbackInsert = await supabaseService
        .from("ai_cases")
        .insert(insertBase)
        .select("id")
        .single();
      inserted = fallbackInsert.data as { id: string } | null;
      insertError = fallbackInsert.error;
    }

    if (insertError?.message?.includes("machine_status")) {
      const baseNoStatus = { ...insertBase } as Record<string, unknown>;
      delete baseNoStatus.machine_status;
      const withPhotosNoStatus = {
        ...baseNoStatus,
        photo_urls: insertWithPhotos.photo_urls,
      };
      const retryMs = await supabaseService
        .from("ai_cases")
        .insert(withPhotosNoStatus)
        .select("id")
        .single();
      inserted = retryMs.data as { id: string } | null;
      insertError = retryMs.error;
      if (insertError?.message?.includes("column ai_cases.photo_urls does not exist")) {
        const retryBase = await supabaseService
          .from("ai_cases")
          .insert(baseNoStatus)
          .select("id")
          .single();
        inserted = retryBase.data as { id: string } | null;
        insertError = retryBase.error;
      }
    }

    if (
      insertError?.message?.includes("machine_id") ||
      insertError?.message?.includes("company_id") ||
      insertError?.message?.includes("tenant_id")
    ) {
      const stripped = { ...insertBase } as Record<string, unknown>;
      delete stripped.machine_id;
      delete stripped.company_id;
      delete stripped.tenant_id;
      const withPhotosStripped = {
        ...stripped,
        photo_urls: insertWithPhotos.photo_urls,
      };
      const retryMc = await supabaseService
        .from("ai_cases")
        .insert(withPhotosStripped)
        .select("id")
        .single();
      inserted = retryMc.data as { id: string } | null;
      insertError = retryMc.error;
      if (insertError?.message?.includes("column ai_cases.photo_urls does not exist")) {
        const retryB = await supabaseService
          .from("ai_cases")
          .insert(stripped)
          .select("id")
          .single();
        inserted = retryB.data as { id: string } | null;
        insertError = retryB.error;
      }
    }

    if (insertError) {
      return NextResponse.json({
        ok: true,
        analysis_text: analysisText,
        priority: gptPriority,
        priority_level: gptPriorityLevel,
        solution_steps: solutionSteps,
        voice_prompts: voicePrompts,
        speak_aloud: speakAloud,
        machine_status: machineStatus,
        case_id: null,
        machine_display_name: machineDisplayName,
        sequential_flow: sequentialFlow,
        warning: `Supabase speichern fehlgeschlagen: ${insertError.message}${
          analyzeErrorText ? ` | GPT-Warnung: ${analyzeErrorText}` : ""
        }`,
      });
    }

    const caseIdFinal = inserted?.id ?? null;
    if (machineId && machineStatus && caseIdFinal) {
      try {
        await supabaseService.from("machine_logs").insert({
          machine_id: machineId,
          user_id: userId,
          ai_case_id: caseIdFinal,
          action: "voice_report",
          detail: transcriptText.slice(0, 2000),
          status_after: machineStatus,
        });
      } catch {
        // machine_logs nicht vorhanden
      }
    }

    return NextResponse.json({
      ok: true,
      analysis_text: analysisText,
      priority: gptPriority,
      priority_level: gptPriorityLevel,
      solution_steps: solutionSteps,
      voice_prompts: voicePrompts,
      speak_aloud: speakAloud,
      machine_status: machineStatus,
      case_id: caseIdFinal,
      machine_display_name: machineDisplayName,
      sequential_flow: sequentialFlow,
      warning: analyzeErrorText ? `GPT-Warnung: ${analyzeErrorText}` : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Interner Fehler bei der Analyse.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
