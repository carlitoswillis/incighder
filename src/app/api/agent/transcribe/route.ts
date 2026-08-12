import { dataApiHeaders, getDataApiUrl } from "@/lib/data-api";
import { isAdmin } from "@/lib/auth";
import { GLO_ENABLED, gloDisabledResponse } from "@/lib/agent/enabled";

// Speech-to-text for GLO's mic. The browser records (MediaRecorder — the only
// capture path that works in every browser, incl. Chrome on iOS) and posts the
// audio here; we transcribe with Gemini using GOOGLE_AI_API_KEY when this
// runtime has it, else forward to the home Mac's data-api /transcribe (which
// loads the same .env) — mirroring the /agent_turn CLI bridge.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // ~30s of audio is well under this

// Same per-instance fixed-window limiter pattern as /api/agent — one bucket
// per IP; an utterance is one request.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.windowStart >= RATE_WINDOW_MS) rateBuckets.delete(key);
  }
  const bucket = rateBuckets.get(ip);
  if (!bucket) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

const TRANSCRIBE_PROMPT =
  "Transcribe this audio verbatim. Return ONLY the spoken words as plain text — no quotes, no commentary, no timestamps. If there is no intelligible speech, return an empty string.";

async function transcribeWithGemini(
  apiKey: string,
  mime: string,
  audioB64: string,
): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: TRANSCRIBE_PROMPT },
              { inline_data: { mime_type: mime, data: audioB64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(40_000),
    },
  );
  if (!res.ok) throw new Error(`transcription service error (${res.status})`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  ).trim();
}

async function transcribeViaDataApi(mime: string, audioB64: string): Promise<string> {
  const url = await getDataApiUrl();
  const res = await fetch(`${url}/transcribe`, {
    method: "POST",
    headers: dataApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ mime, audio_b64: audioB64 }),
    signal: AbortSignal.timeout(45_000),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`transcription bridge returned a non-JSON response (${res.status})`);
  }
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || typeof data.text !== "string") {
    throw new Error(data.error || `transcription bridge error (${res.status})`);
  }
  return data.text.trim();
}

export async function POST(request: Request) {
  if (!GLO_ENABLED) return gloDisabledResponse();
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (isRateLimited(ip)) {
    return Response.json({ error: "Rate limited — try again shortly." }, { status: 429 });
  }

  const mime = (request.headers.get("content-type") || "audio/webm").split(";")[0].trim();
  if (!mime.startsWith("audio/")) {
    return Response.json({ error: "Send raw audio with an audio/* content type." }, { status: 400 });
  }
  const audio = await request.arrayBuffer();
  if (!audio.byteLength) return Response.json({ error: "Empty audio." }, { status: 400 });
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio too large." }, { status: 413 });
  }
  const audioB64 = Buffer.from(audio).toString("base64");

  // Bridge first: the Mac transcribes locally with faster-whisper (offline,
  // no quota). Gemini direct is only the fallback — its free-tier daily caps
  // 429 under real use.
  try {
    const text = await transcribeViaDataApi(mime, audioB64);
    return Response.json({ text });
  } catch (bridgeError) {
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.error("Transcription failed (no fallback):", bridgeError);
      return Response.json({ error: "Transcription unavailable." }, { status: 502 });
    }
    try {
      const text = await transcribeWithGemini(geminiKey, mime, audioB64);
      return Response.json({ text });
    } catch (e) {
      console.error("Transcription failed:", e);
      return Response.json(
        { error: e instanceof Error ? e.message : "Transcription failed." },
        { status: 502 },
      );
    }
  }
}
