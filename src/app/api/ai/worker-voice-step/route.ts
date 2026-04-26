import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { transcribeAudio } from "@/lib/openai";
import {
  getPhotoInstructionDe,
  getQuestionForStep,
  REPEAT_PROMPT_DE,
  validateVoiceAnswerForFieldWithTimeout,
  type SequentialField,
} from "@/lib/workerVoiceSequential";

export const runtime = "nodejs";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

const SPEAK_TIMEOUT_MACHINE_TO_ISSUE =
  "Ich habe dich verstanden, weiter zu Schritt 2.";
const SPEAK_TIMEOUT_ISSUE_TO_PHOTO =
  "Ich habe dich verstanden, weiter zum Foto.";

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase ist nicht konfiguriert." },
        { status: 500 },
      );
    }

    const accessToken = request.cookies.get("sb-access-token")?.value;
    if (!accessToken) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userData: { user: { id: string } } | null = null;
    try {
      const res = await supabaseUser.auth.getUser();
      if (res.error || !res.data.user) {
        return NextResponse.json(
          { error: "Session ist nicht gültig." },
          { status: 401 },
        );
      }
      userData = res.data as { user: { id: string } };
    } catch {
      return NextResponse.json(
        { error: "Supabase-Auth vorübergehend nicht erreichbar." },
        { status: 503 },
      );
    }

    void userData;

    const formData = await request.formData();
    const action = String(formData.get("action") ?? "").trim();

    if (action === "init") {
      const step: Exclude<SequentialField, "photo"> = "machine_name";
      return NextResponse.json({
        status: "question",
        step,
        speak: getQuestionForStep(step),
      });
    }

    if (action !== "answer") {
      return NextResponse.json(
        { error: "Ungültige action (init oder answer)." },
        { status: 400 },
      );
    }

    const stepRaw = String(formData.get("step") ?? "").trim();
    if (stepRaw !== "machine_name" && stepRaw !== "issue_description") {
      return NextResponse.json(
        { error: "step muss machine_name oder issue_description sein." },
        { status: 400 },
      );
    }

    const audioEntry = formData.get("audio");
    const audioFile =
      audioEntry instanceof File && audioEntry.size > 0
        ? audioEntry
        : audioEntry instanceof Blob && audioEntry.size > 0
          ? new File([audioEntry], "audio.webm", {
              type: audioEntry.type || "audio/webm",
            })
          : null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Keine Sprachaufnahme empfangen." },
        { status: 400 },
      );
    }

    let transcript = "";
    try {
      transcript = await transcribeAudio(audioFile);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transkription fehlgeschlagen.";
      return NextResponse.json(
        {
          status: "repeat",
          speak: REPEAT_PROMPT_DE,
          detail: msg,
          transcript: "",
        },
        { status: 200 },
      );
    }

    console.log("User sprach:", transcript);

    const field = stepRaw as "machine_name" | "issue_description";

    let validationResult: Awaited<
      ReturnType<typeof validateVoiceAnswerForFieldWithTimeout>
    >;
    try {
      validationResult = await validateVoiceAnswerForFieldWithTimeout(
        field,
        transcript,
      );
    } catch {
      const t = transcript.trim();
      validationResult = {
        validation: {
          valid: t.length >= 2,
          unclear: t.length < 2,
          normalized: t.length >= 2 ? t.slice(0, 200) : null,
        },
        timedOut: true,
      };
    }

    const { validation, timedOut } = validationResult;
    const aiResponse = { validation, timedOut, field };
    console.log("KI Analyse Ergebnis:", JSON.stringify(aiResponse));

    const goToNextStep = () => {
      const value =
        validation.valid &&
        validation.normalized &&
        validation.normalized.trim().length >= 2
          ? validation.normalized
          : transcript.trim().slice(0, 200);

      if (field === "machine_name") {
        const nextStep: SequentialField = "issue_description";
        const speak = timedOut
          ? SPEAK_TIMEOUT_MACHINE_TO_ISSUE
          : getQuestionForStep("issue_description");
        return NextResponse.json({
          status: "advance",
          next_step: nextStep,
          speak,
          machine_name: value,
          transcript,
          ki_timeout: timedOut,
          ai_response: aiResponse,
        });
      }

      const speak = timedOut
        ? SPEAK_TIMEOUT_ISSUE_TO_PHOTO
        : getPhotoInstructionDe();
      return NextResponse.json({
        status: "advance",
        next_step: "photo",
        speak,
        issue_description: value,
        transcript,
        ki_timeout: timedOut,
        ai_response: aiResponse,
      });
    };

    const canAdvance =
      (validation.valid &&
        !validation.unclear &&
        validation.normalized &&
        validation.normalized.length >= 2) ||
      transcript.trim().length >= 2;

    if (canAdvance) {
      return goToNextStep();
    }

    return NextResponse.json({
      status: "repeat",
      speak: REPEAT_PROMPT_DE,
      transcript,
      ai_response: aiResponse,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Interner Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
