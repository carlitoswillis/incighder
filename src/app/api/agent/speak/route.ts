import { dataApiHeaders, getDataApiUrl } from "@/lib/data-api";
import { isAdmin } from "@/lib/auth";

// Text-to-speech for GLO's spoken replies: Gemini's TTS model reading in a
// natural British delivery (style + voice overridable via env). Same runtime
// split as /transcribe — Gemini directly when this runtime has a key, else
// bridged to the home Mac's data-api /speak. Returns audio/wav.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_TEXT_CHARS = 2000; // spoken answers are headlines + detail, not essays

const RATE_LIMIT = 60; // chunked playback sends one small request per sentence group
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

function ttsConfig() {
  return {
    model: process.env.GLO_TTS_MODEL || "gemini-2.5-flash-preview-tts",
    // GLO_TTS_VOICE is the edge-tts (bridge) voice; Gemini names differ.
    voice: process.env.GLO_TTS_GEMINI_VOICE || "Despina",
    style:
      process.env.GLO_TTS_STYLE ||
      "Read this aloud as a poised British woman with a natural, warm English accent — conversational and unhurried, like a sharp manager briefing a friend",
  };
}

/** Gemini TTS returns raw 16-bit mono PCM (audio/L16;rate=NNNNN) — wrap it in
 * a WAV header so <audio> can play it. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function speakWithGemini(apiKey: string, text: string): Promise<Buffer> {
  const { model, voice, style } = ttsConfig();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${style}: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );
  if (!res.ok) throw new Error(`speech service error (${res.status})`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
  };
  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline?.data) throw new Error("speech service returned no audio");
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType ?? "")?.[1] ?? 24000);
  return pcmToWav(Buffer.from(inline.data, "base64"), rate);
}

async function speakViaDataApi(text: string): Promise<{ audio: Buffer; mime: string }> {
  const url = await getDataApiUrl();
  const res = await fetch(`${url}/speak`, {
    method: "POST",
    headers: dataApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(50_000),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("audio/")) {
    throw new Error(`speech bridge error (${res.status})`);
  }
  return { audio: Buffer.from(await res.arrayBuffer()), mime: contentType };
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (isRateLimited(ip)) {
    return Response.json({ error: "Rate limited — try again shortly." }, { status: 429 });
  }
  let text = "";
  try {
    const body = ((await request.json()) as { text?: unknown } | null) ?? {};
    if (typeof body.text === "string") text = body.text.trim();
  } catch {
    // handled below
  }
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  text = text.slice(0, MAX_TEXT_CHARS);

  // Bridge first: the Mac renders with edge-tts (free, no quota, natural
  // British neural voice). Gemini TTS direct is the fallback — its preview
  // model's free-tier daily quota is tiny and 429s under normal use.
  try {
    const { audio, mime } = await speakViaDataApi(text);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": mime, "Cache-Control": "no-store" },
    });
  } catch (bridgeError) {
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.error("Speech synthesis failed (no fallback):", bridgeError);
      return Response.json({ error: "Speech synthesis unavailable." }, { status: 502 });
    }
    try {
      const wav = await speakWithGemini(geminiKey, text);
      return new Response(new Uint8Array(wav), {
        headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
      });
    } catch (e) {
      console.error("Speech synthesis failed:", e);
      return Response.json(
        { error: e instanceof Error ? e.message : "Speech synthesis failed." },
        { status: 502 },
      );
    }
  }
}
