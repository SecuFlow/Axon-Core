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
  type ExistingMachineHint,
} from "@/lib/openai";
import { createClient } from "@supabase/supabase-js";
import { VIDEOS_BUCKET } from "@/lib/supabaseStoragePublic";
import { resolveDefaultLocationIdForUser } from "@/lib/resolveDefaultLocation";
import { resolveActorMandantId } from "@/lib/mandantScope";
import {
  loadTenantByCompanyPkMap,
  resolveProfileMandantTenantId,
} from "@/lib/profileMandateResolve.server";

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

    // === Tenant + Profile VORHER auflösen, damit wir GPT die Maschinen-Liste ===
    // === geben können (Match auf „S01" / „CNC Linie 3" / …).               ===
    const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const profRow = await supabaseService
      .from("profiles")
      .select("tenant_id, mandant_id, company_id")
      .eq("id", userId)
      .maybeSingle();

    const pr = profRow.data as
      | {
          tenant_id?: string | null;
          mandant_id?: string | null;
          company_id?: string | null;
        }
      | null;

    const tenantByCompanyPk = await loadTenantByCompanyPkMap(supabaseService);

    let tenantId = await resolveProfileMandantTenantId(
      supabaseService,
      {
        company_id:
          typeof pr?.company_id === "string" && pr.company_id.trim()
            ? pr.company_id.trim()
            : null,
        tenant_id:
          typeof pr?.tenant_id === "string" && pr.tenant_id.trim()
            ? pr.tenant_id.trim()
            : null,
        mandant_id:
          typeof pr?.mandant_id === "string" && pr.mandant_id.trim()
            ? pr.mandant_id.trim()
            : null,
      },
      tenantByCompanyPk,
    );

    if (!tenantId) {
      tenantId = await resolveActorMandantId(supabaseService, userId);
    }

    // Bestehende Maschinen des Mandanten laden — fließen als Kontext in den GPT-Prompt,
    // damit „S01" sauber auf eine Maschine im Inventar gemappt werden kann.
    const existingMachines: ExistingMachineHint[] = [];
    if (tenantId) {
      try {
        const { data: mRows } = await supabaseService
          .from("machines")
          .select("name, serial_number, status, updated_at")
          .eq("mandant_id", tenantId)
          .order("updated_at", { ascending: false })
          .limit(40);
        if (Array.isArray(mRows)) {
          for (const m of mRows as Array<{
            name?: string | null;
            serial_number?: string | null;
            status?: string | null;
          }>) {
            existingMachines.push({
              name: typeof m.name === "string" ? m.name : null,
              serial: typeof m.serial_number === "string" ? m.serial_number : null,
              status: typeof m.status === "string" ? m.status : null,
            });
          }
        }
      } catch {
        // Wenn das Inventar (noch) nicht abrufbar ist, läuft die Analyse trotzdem.
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
    let requiredPart: string | null = null;
    let safetyNotes: string[] = [];

    try {
      const gptResult = await analyzeWorkerInputWithGpt({
        transcriptText,
        photoDataUrls,
        existingMachines,
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
      requiredPart = gptResult.required_part;
      safetyNotes = gptResult.safety_notes;
    } catch (err) {
      analyzeErrorText = err instanceof Error ? err.message : "GPT-Analyse fehlgeschlagen.";
      machineStatus = mapNlpKeywordsToMachineStatus(transcriptText);
      if (sequentialFlow && seqMachine) {
        machineNameForDb = seqMachine.slice(0, 500);
      }
    }

    // Lockerer Slug-Vergleich (gleicht „S01" / „S-01" / „s 01" an).
    const slugForMatch = (s: string | null | undefined): string =>
      (s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "");

    // Falls GPT keinen Label gefunden hat, aber wir per Pattern-Fallback eine
    // Seriennummer ableiten können (z. B. „S01" aus dem Transkript), nutzen wir
    // die als Maschinen-Namen, damit die UI nicht „Unbekannte Maschine" zeigt.
    if (!machineNameForDb) {
      const fallbackSerial = resolveSerialForInventory({
        gptSerial,
        machineLabel: null,
        transcriptText,
      });
      if (fallbackSerial) {
        const norm = slugForMatch(fallbackSerial);
        const match = existingMachines.find(
          (m) =>
            slugForMatch(m.name) === norm || slugForMatch(m.serial) === norm,
        );
        machineNameForDb = (match?.name ?? fallbackSerial).slice(0, 500);
        if (!gptSerial) gptSerial = match?.serial ?? fallbackSerial;
      }
    }

    // Bestehende Inventar-Maschinen wiedererkennen: wenn der gesprochene Name
    // (z. B. „S01") slug-gleich zu einer bekannten Maschine ist, übernehmen
    // wir Name + Seriennummer aus dem Inventar — verhindert Duplikate und
    // sorgt für konsistente Anzeige.
    if (machineNameForDb && existingMachines.length > 0) {
      // Lockerer Bezeichner („S01", „CNC-3") aus dem Label extrahieren, damit
      // „Maschine S01" auch zum Inventar-Eintrag „S01" matched.
      const looseFromLabel =
        machineNameForDb.match(/\b([A-Z]{1,6}[-_/]?\d{1,6}[A-Z]?)\b/i)?.[1] ??
        null;
      const candidateSlugs = [
        slugForMatch(machineNameForDb),
        slugForMatch(gptSerial),
        slugForMatch(looseFromLabel),
      ].filter((s) => s.length >= 2);
      if (candidateSlugs.length > 0) {
        const match = existingMachines.find((m) => {
          const a = slugForMatch(m.name);
          const b = slugForMatch(m.serial);
          return candidateSlugs.some(
            (cs) => (a && a === cs) || (b && b === cs),
          );
        });
        if (match) {
          if (match.name && match.name.trim()) {
            machineNameForDb = match.name.slice(0, 500);
          }
          if (!gptSerial && match.serial) {
            gptSerial = match.serial;
          }
        }
      }
    }

    const machineDisplayName =
      machineNameForDb ?? (sequentialFlow ? seqMachine : null) ?? null;

    // Sicherheitshinweise vorne an die Lösungsschritte ziehen (sichtbarer Effekt
    // ohne Schema-Änderung — bestehende UI zeigt solution_steps an).
    if (safetyNotes.length > 0) {
      const tagged = safetyNotes
        .map((n) => (/^sicherheit/i.test(n) ? n : `Sicherheit: ${n}`))
        .filter((n) => !solutionSteps.includes(n));
      solutionSteps = [...tagged, ...solutionSteps];
    }

    const speakAloud = sequentialFlow
      ? []
      : collectInstructionUtterances({
          voicePrompts,
          analysisText,
          solutionSteps,
        });

    // `ai_cases.company_id` ist FK auf companies.id (PK). Wir dürfen dort NICHT
    // die Mandanten-UUID schreiben. Wir lösen daher die zur Mandanten-UUID
    // passende companies.id (PK) auf — primär aus profiles.company_id, sonst
    // über companies.tenant_id = tenantId.
    let companyPk: string | null = null;
    const profileCompanyRaw =
      typeof pr?.company_id === "string" && pr.company_id.trim()
        ? pr.company_id.trim()
        : null;
    if (profileCompanyRaw) {
      const { data: row } = await supabaseService
        .from("companies")
        .select("id, tenant_id")
        .eq("id", profileCompanyRaw)
        .maybeSingle();
      const r = row as { id?: string; tenant_id?: string | null } | null;
      if (r?.id && (!tenantId || r.tenant_id === tenantId)) {
        companyPk = r.id;
      }
    }
    if (!companyPk && tenantId) {
      const { data: rows } = await supabaseService
        .from("companies")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1);
      const first = (rows as Array<{ id?: string }> | null)?.[0];
      if (first?.id) companyPk = first.id;
    }

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
              ...(companyPk ? { company_id: companyPk } : {}),
              serial_number: serialResolved,
              name: machineNameForDb ?? serialResolved,
              status: statusForMachine,
              updated_at: new Date().toISOString(),
              ...(defaultLocationId ? { location_id: defaultLocationId } : {}),
            },
            companyPk
              ? { onConflict: "company_id,serial_number" }
              : { onConflict: "mandant_id,serial_number" },
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
      ...(requiredPart ? { required_part: requiredPart } : {}),
      manager_public_approved: false,
      ...(machineId ? { machine_id: machineId } : {}),
      ...(tenantId ? { tenant_id: tenantId, mandant_id: tenantId } : {}),
      ...(companyPk ? { company_id: companyPk } : {}),
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

    // Graceful Fallback, falls die ältere Tabelle noch keine `required_part`-Spalte hat.
    if (insertError?.message?.includes("required_part")) {
      const baseNoPart = { ...insertBase } as Record<string, unknown>;
      delete baseNoPart.required_part;
      const withPhotosNoPart = {
        ...baseNoPart,
        photo_urls: insertWithPhotos.photo_urls,
      };
      const retryPart = await supabaseService
        .from("ai_cases")
        .insert(withPhotosNoPart)
        .select("id")
        .single();
      inserted = retryPart.data as { id: string } | null;
      insertError = retryPart.error;
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
