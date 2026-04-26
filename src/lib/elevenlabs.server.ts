type ElevenLabsVoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
};

export type ElevenLabsTtsOptions = {
  voiceId?: string;
  modelId?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  outputFormat?: string;
};

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

export function getElevenLabsConfig() {
  const apiKey = sanitizeEnv(process.env.ELEVENLABS_API_KEY);
  const voiceId = sanitizeEnv(process.env.ELEVENLABS_VOICE_ID);
  const modelId = sanitizeEnv(process.env.ELEVENLABS_MODEL_ID) ?? "eleven_multilingual_v2";
  return { apiKey, voiceId, modelId };
}

export async function elevenLabsTtsStream(input: {
  text: string;
  options?: ElevenLabsTtsOptions;
}): Promise<Response> {
  const { apiKey, voiceId: envVoiceId, modelId: envModelId } = getElevenLabsConfig();
  if (!apiKey) {
    return new Response("ElevenLabs ist nicht konfiguriert.", { status: 503 });
  }

  const text = input.text.trim();
  if (!text) {
    return new Response("Text fehlt.", { status: 400 });
  }

  const voiceId = input.options?.voiceId ?? envVoiceId;
  if (!voiceId) {
    return new Response("ELEVENLABS_VOICE_ID fehlt.", { status: 503 });
  }

  const model_id = input.options?.modelId ?? envModelId;
  const output_format = input.options?.outputFormat ?? "mp3_44100_128";
  const voice_settings = input.options?.voiceSettings ?? {
    stability: 0.45,
    similarity_boost: 0.8,
    use_speaker_boost: true,
  };

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${encodeURIComponent(
    output_format,
  )}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id,
      voice_settings,
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return new Response(
      `ElevenLabs Fehler (${upstream.status}): ${detail || upstream.statusText}`,
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}

