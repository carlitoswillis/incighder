"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Minimal ambient types for the Web Speech recognition API (not in lib.dom,
// and we don't want an @types dep or `any` leaks).
// ---------------------------------------------------------------------------

interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternative;
}

interface RecognitionResultList {
  length: number;
  [index: number]: RecognitionResult;
}

interface RecognitionResultEvent {
  resultIndex: number;
  results: RecognitionResultList;
}

interface RecognitionErrorEvent {
  error: string;
}

/** Friendly explanations per SpeechRecognition error code; null = stay silent
 * (user-initiated or harmless). */
const VOICE_ERRORS: Record<string, string | null> = {
  aborted: null,
  "no-speech": "Didn't hear anything — try again closer to the mic.",
  "not-allowed":
    "Microphone access is blocked. Allow the mic for this site in your browser settings.",
  "service-not-allowed":
    "The browser's speech service is unavailable — on Safari, enable Siri or Dictation in System Settings.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition couldn't reach the browser's online service.",
};

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// ---------------------------------------------------------------------------
// Speech input (mic → text)
// ---------------------------------------------------------------------------

export function useSpeechInput(handlers: {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** Called with a human-readable reason when recognition fails to run. */
  onError?: (message: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Keep the latest handlers without re-wiring the recognition instance.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Feature-detect after mount so SSR markup never disagrees with the client.
  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    // abort(), not stop(): stop() flushes a pending final result, which would
    // auto-send a message the user just cancelled.
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      // Ignore results from a superseded/cancelled instance.
      if (recognitionRef.current !== rec) return;
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) final += alt.transcript;
        else interim += alt.transcript;
      }
      if (final.trim()) {
        recognitionRef.current = null;
        rec.stop();
        setListening(false);
        handlersRef.current.onFinal(final.trim());
      } else if (interim) {
        handlersRef.current.onInterim(interim);
      }
    };
    // Light the recording dot only once capture actually begins — flipping it
    // on before start() means a denied/failing mic flashes red for a frame.
    rec.onstart = () => {
      if (recognitionRef.current === rec) setListening(true);
    };
    rec.onend = () => {
      if (recognitionRef.current === rec) recognitionRef.current = null;
      setListening(false);
    };
    rec.onerror = (event) => {
      if (recognitionRef.current === rec) recognitionRef.current = null;
      setListening(false);
      // Surface why the mic died instead of silently flashing the dot.
      const reason = VOICE_ERRORS[event.error];
      if (reason !== null) {
        handlersRef.current.onError?.(
          reason ?? `Voice input failed (${event.error || "unknown error"}).`,
        );
      }
    };
    recognitionRef.current = rec;
    rec.start();
  }, []);

  const toggle = useCallback(() => {
    if (recognitionRef.current) stop();
    else start();
  }, [start, stop]);

  // Kill the mic if the panel unmounts mid-dictation.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return { supported, listening, start, stop, toggle };
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

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const cleaned = cleanForSpeech(text);
    if (!cleaned) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }, []);

  // Silence on unmount.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  return { enabled, toggle, speak, cancel };
}
