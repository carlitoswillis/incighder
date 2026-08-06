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

export function useSpeaker() {
  const [enabled, setEnabled] = useState(false);

  // Restore the persisted preference after mount (SSR-safe).
  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(SPEAK_PREF_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  const cancel = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SPEAK_PREF_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      if (!next) window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  /** Speak text; resolves when the utterance finishes (or is cancelled), so
   * hands-free voice mode can wait before re-opening the mic. */
  const speak = useCallback((text: string): Promise<void> => {
    if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve();
    const cleaned = cleanForSpeech(text);
    if (!cleaned) return Promise.resolve();
    window.speechSynthesis.cancel();
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = 1.05;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Silence on unmount.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  return { enabled, toggle, speak, cancel };
}
