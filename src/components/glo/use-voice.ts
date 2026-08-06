"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Speech input (mic → text) — MediaRecorder + server-side transcription.
//
// Deliberately NOT the Web Speech SpeechRecognition API: on iOS every browser
// is WebKit and Apple reserves the system speech service for Safari, so
// Chrome-on-iPhone always fails with "service-not-allowed" no matter what the
// user enables. getUserMedia + MediaRecorder works everywhere; the audio is
// transcribed by POST /api/agent/transcribe. A light RMS-based voice-activity
// detector auto-stops after a trailing silence so it feels like ChatGPT's
// voice input: tap, talk, done.
// ---------------------------------------------------------------------------

/** Trailing silence (ms) after detected speech that ends the take. */
const SILENCE_MS = 1500;
/** Give up if nothing above the threshold was ever heard. */
const NO_SPEECH_MS = 8000;
/** Hard cap per utterance. */
const MAX_TAKE_MS = 30_000;
/** RMS (0..1) above this counts as speech. */
const SPEECH_RMS = 0.02;

function pickMimeType(): string {
  // Chrome/Firefox record webm/opus; iOS WebKit records mp4/AAC.
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

interface Take {
  recorder: MediaRecorder;
  stream: MediaStream;
  audioCtx: AudioContext;
  vadTimer: number;
  chunks: Blob[];
  cancelled: boolean;
}

export function useSpeechInput(handlers: {
  onFinal: (text: string) => void;
  /** Called with a human-readable reason when voice input fails. */
  onError?: (message: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  // True while the recorded take is being transcribed server-side.
  const [processing, setProcessing] = useState(false);
  const takeRef = useRef<Take | null>(null);
  // Keep the latest handlers without re-wiring the recorder.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Feature-detect after mount so SSR markup never disagrees with the client.
  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  const teardown = useCallback((take: Take) => {
    window.clearInterval(take.vadTimer);
    take.stream.getTracks().forEach((t) => t.stop());
    void take.audioCtx.close().catch(() => {});
    if (takeRef.current === take) takeRef.current = null;
  }, []);

  /** Stop the current take. send=false discards it (close/unmount). */
  const stop = useCallback((send = false) => {
    const take = takeRef.current;
    if (!take) return;
    take.cancelled = !send;
    setListening(false);
    if (take.recorder.state !== "inactive") take.recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (takeRef.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      handlersRef.current.onError?.(
        "Microphone access is blocked. Allow the mic for this site in your browser settings.",
      );
      return;
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      handlersRef.current.onError?.("This browser can't record audio.");
      return;
    }

    // RMS-based VAD: arm on first speech, stop after a trailing silence.
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = Date.now();
    let lastSpeechAt = 0;

    const take: Take = { recorder, stream, audioCtx, vadTimer: 0, chunks: [], cancelled: false };

    take.vadTimer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const dev = (samples[i] - 128) / 128;
        sum += dev * dev;
      }
      const rms = Math.sqrt(sum / samples.length);
      const now = Date.now();
      if (rms > SPEECH_RMS) lastSpeechAt = now;
      if (lastSpeechAt && now - lastSpeechAt > SILENCE_MS) stop(true);
      else if (!lastSpeechAt && now - startedAt > NO_SPEECH_MS) {
        stop(false);
        handlersRef.current.onError?.("Didn't hear anything — try again closer to the mic.");
      } else if (now - startedAt > MAX_TAKE_MS) stop(true);
    }, 100);

    recorder.ondataavailable = (e) => {
      if (e.data.size) take.chunks.push(e.data);
    };
    recorder.onstart = () => {
      if (takeRef.current === take) setListening(true);
    };
    recorder.onerror = () => {
      teardown(take);
      setListening(false);
      handlersRef.current.onError?.("Recording failed.");
    };
    recorder.onstop = () => {
      teardown(take);
      setListening(false);
      if (take.cancelled) return;
      const blob = new Blob(take.chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      // A sub-kilobyte take is a tap with no audio — don't waste a request.
      if (blob.size < 1024) return;
      setProcessing(true);
      void (async () => {
        try {
          const res = await fetch("/api/agent/transcribe", {
            method: "POST",
            headers: { "Content-Type": blob.type },
            body: blob,
            signal: AbortSignal.timeout(45_000),
          });
          const data = (await res.json()) as { text?: string; error?: string };
          if (!res.ok || typeof data.text !== "string") {
            throw new Error(data.error || `transcription failed (${res.status})`);
          }
          if (data.text.trim()) handlersRef.current.onFinal(data.text.trim());
          else handlersRef.current.onError?.("Couldn't make out any words — try again.");
        } catch (e) {
          handlersRef.current.onError?.(
            e instanceof Error ? e.message : "Transcription failed — try again.",
          );
        } finally {
          setProcessing(false);
        }
      })();
    };

    takeRef.current = take;
    // Timeslice keeps chunks flowing on iOS, where a single final blob can be empty.
    recorder.start(1000);
  }, [stop, teardown]);

  const toggle = useCallback(() => {
    // Tap while recording = "I'm done talking" (the VAD usually beats you to it).
    if (takeRef.current) stop(true);
    else void start();
  }, [start, stop]);

  // Kill the mic if the panel unmounts mid-take.
  useEffect(() => {
    return () => {
      const take = takeRef.current;
      if (take) {
        take.cancelled = true;
        if (take.recorder.state !== "inactive") take.recorder.stop();
        else {
          window.clearInterval(take.vadTimer);
          take.stream.getTracks().forEach((t) => t.stop());
          void take.audioCtx.close().catch(() => {});
        }
        takeRef.current = null;
      }
    };
  }, []);

  return { supported, listening, processing, start, stop, toggle };
}

// ---------------------------------------------------------------------------
// Speech output (text → voice), gated by a persisted speaker toggle
// ---------------------------------------------------------------------------

const SPEAK_PREF_KEY = "glo_speak";

/** Strip markdown/urls so the synthesizer reads prose, not syntax. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1") // [text](url) → text
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/[*_`#>~]+/g, " ")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A beat of silence: playing this inside a user gesture unlocks programmatic
 * audio playback on iOS, so fetched TTS can start later without a tap. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/** Browser-voice fallback for when the TTS endpoint is unreachable — prefer a
 * British system voice so the accent survives the downgrade. */
function speakWithBrowser(cleaned: string): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve();
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(cleaned);
    const voices = window.speechSynthesis.getVoices();
    const british =
      voices.find((v) => v.lang.startsWith("en-GB") && /premium|enhanced|natural/i.test(v.name)) ??
      voices.find((v) => v.lang.startsWith("en-GB"));
    if (british) utterance.voice = british;
    utterance.rate = 1.02;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

/** Split cleaned prose into speakable chunks at sentence boundaries, merging
 * short sentences so each TTS request carries a meaningful stretch. */
function splitForSpeech(text: string, target = 220): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current && current.length + s.length > target) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

export function useSpeaker() {
  const [enabled, setEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Resolver for the in-flight playback promise, so cancel() can settle it.
  const playingRef = useRef<(() => void) | null>(null);
  // The active speak() run — cancel() flags it and aborts its fetches.
  const speakRunRef = useRef<{ cancelled: boolean; abort: AbortController } | null>(null);

  // Restore the persisted preference after mount (SSR-safe).
  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(SPEAK_PREF_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  /** Call from a click/tap handler: primes the shared <audio> element so iOS
   * allows later programmatic playback of fetched speech. */
  const unlock = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    if (!audio.src) {
      audio.src = SILENT_WAV;
      void audio.play().catch(() => {});
    }
  }, []);

  const cancel = useCallback(() => {
    const run = speakRunRef.current;
    if (run) {
      run.cancelled = true;
      run.abort.abort();
      speakRunRef.current = null;
    }
    const audio = audioRef.current;
    if (audio && !audio.paused) audio.pause();
    playingRef.current?.();
    playingRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const toggle = useCallback(() => {
    unlock();
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SPEAK_PREF_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      if (!next) cancel();
      return next;
    });
  }, [cancel, unlock]);

  /** Speak text via the server's natural-voice TTS (British delivery),
   * falling back to a British browser voice if the endpoint is unreachable.
   * The text is split into sentence chunks and pipelined — the first chunk
   * plays while the next renders, so speech starts ~a second behind the text
   * instead of waiting for the whole answer to synthesize. Resolves when
   * playback finishes (or is cancelled), so hands-free voice mode can wait
   * before re-opening the mic. */
  const speak = useCallback(
    async (text: string): Promise<void> => {
      const cleaned = cleanForSpeech(text);
      if (!cleaned) return;
      cancel();
      const run = { cancelled: false, abort: new AbortController() };
      speakRunRef.current = run;

      const fetchChunk = async (chunk: string): Promise<Blob | null> => {
        try {
          const res = await fetch("/api/agent/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: chunk }),
            signal: AbortSignal.any([run.abort.signal, AbortSignal.timeout(30_000)]),
          });
          if (!res.ok || !(res.headers.get("content-type") ?? "").includes("audio/")) return null;
          return await res.blob();
        } catch {
          return null;
        }
      };

      const playBlob = (blob: Blob): Promise<void> => {
        const url = URL.createObjectURL(blob);
        if (!audioRef.current) audioRef.current = new Audio();
        const audio = audioRef.current;
        return new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            URL.revokeObjectURL(url);
            if (playingRef.current === done) playingRef.current = null;
            resolve();
          };
          playingRef.current = done;
          audio.onended = done;
          audio.onerror = done;
          audio.src = url;
          audio.play().catch(done);
        });
      };

      const chunks = splitForSpeech(cleaned);
      let next = fetchChunk(chunks[0]);
      for (let i = 0; i < chunks.length; i++) {
        const blob = await next;
        if (run.cancelled) return;
        // Prefetch the next chunk while this one plays.
        next = i + 1 < chunks.length ? fetchChunk(chunks[i + 1]) : Promise.resolve(null);
        if (!blob) {
          // Endpoint down or autoplay refused — finish the rest in the
          // browser voice rather than going silent.
          await speakWithBrowser(chunks.slice(i).join(" "));
          return;
        }
        await playBlob(blob);
        if (run.cancelled) return;
      }
    },
    [cancel],
  );

  // Silence on unmount.
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) audio.pause();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  return { enabled, toggle, speak, cancel, unlock };
}
