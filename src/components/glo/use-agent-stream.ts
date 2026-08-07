"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type Role = "user" | "assistant";

export interface ToolActivity {
  name: string;
  label: string;
  ok?: boolean;
  summary?: string;
}

export interface TranscriptItem {
  role: Role;
  content: string;
  /** Tool executions attached to an assistant turn, in start order. */
  activity?: ToolActivity[];
  /** Set when the turn ended in an error (server event or transport failure). */
  error?: string;
}

export interface AgentContext {
  artistId?: string;
  group?: string;
}

type AgentEvent =
  | { type: "tool"; name: string; label: string }
  | { type: "tool_result"; name: string; ok: boolean; summary: string }
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

const STORAGE_KEY = "glo_transcript";

function loadTranscript(): TranscriptItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const items = Array.isArray(parsed) ? (parsed as TranscriptItem[]) : [];
    // A restored transcript is never mid-stream: resolve activity entries that
    // were still pending when the page went away, and give a trailing empty
    // assistant turn an error state instead of an empty live bubble.
    return items.map((item, i) => {
      let next = item;
      if (next.activity?.some((a) => a.ok === undefined)) {
        next = {
          ...next,
          activity: (next.activity ?? []).map((a) =>
            a.ok === undefined ? { ...a, ok: false, summary: a.summary ?? "interrupted" } : a,
          ),
        };
      }
      if (i === items.length - 1 && next.role === "assistant" && !next.content && !next.error) {
        next = { ...next, error: "Interrupted." };
      }
      return next;
    });
  } catch {
    return [];
  }
}

/**
 * SSE client for POST /api/agent. Owns the transcript (persisted to
 * sessionStorage) and the streaming lifecycle: tool events, text deltas,
 * errors, and cancellation.
 */
export function useAgentStream() {
  const [transcript, setTranscript] = useState<TranscriptItem[]>(loadTranscript);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  // Persist across navigations within the tab.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(transcript));
    } catch {
      // Storage full/unavailable — the chat still works, it just won't survive navigation.
    }
  }, [transcript]);

  // Cancel any in-flight stream when the panel unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setTranscript([]);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  /** Append a local assistant note (no server turn) — e.g. an upload
   * confirmation. It persists into the transcript, so later turns' history
   * tells the model what was added. */
  const note = useCallback((content: string) => {
    setTranscript((t) => [...t, { role: "assistant", content }]);
  }, []);

  /** Patch the trailing assistant item (the one currently streaming). */
  const patchLast = useCallback(
    (fn: (item: TranscriptItem) => TranscriptItem) => {
      setTranscript((t) => {
        if (t.length === 0) return t;
        const last = t[t.length - 1];
        if (last.role !== "assistant") return t;
        return [...t.slice(0, -1), fn(last)];
      });
    },
    [],
  );

  /**
   * Send a user message. Resolves with the assistant's final text, or null if
   * the turn was aborted or errored.
   */
  const send = useCallback(
    async (text: string, context?: AgentContext): Promise<string | null> => {
      const trimmed = text.trim();
      if (!trimmed) return null;

      // A new send supersedes any in-flight stream.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const messages = [...transcriptRef.current, { role: "user" as Role, content: trimmed }]
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      setTranscript((t) => [
        ...t,
        { role: "user", content: trimmed },
        { role: "assistant", content: "", activity: [] },
      ]);
      setStreaming(true);

      let finalText = "";
      let failed = false;
      let sawDone = false;

      const handleEvent = (ev: AgentEvent) => {
        switch (ev.type) {
          case "tool":
            // A tool call starts a new answer round — separate it from any
            // text the previous round already produced.
            if (/\S$/.test(finalText)) finalText += "\n\n";
            patchLast((item) => ({
              ...item,
              content: /\S$/.test(item.content) ? `${item.content}\n\n` : item.content,
              activity: [...(item.activity ?? []), { name: ev.name, label: ev.label }],
            }));
            break;
          case "tool_result":
            patchLast((item) => {
              const activity = [...(item.activity ?? [])];
              // Resolve the most recent still-pending run of this tool.
              for (let i = activity.length - 1; i >= 0; i--) {
                if (activity[i].name === ev.name && activity[i].ok === undefined) {
                  activity[i] = { ...activity[i], ok: ev.ok, summary: ev.summary };
                  break;
                }
              }
              return { ...item, activity };
            });
            break;
          case "text":
            finalText += ev.delta;
            patchLast((item) => ({ ...item, content: item.content + ev.delta }));
            break;
          case "error":
            failed = true;
            sawDone = true;
            patchLast((item) => ({ ...item, error: ev.message }));
            toast.error(ev.message);
            break;
          case "done":
            sawDone = true;
            break;
        }
      };

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, context }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`GLO is unavailable right now (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are 'data: <JSON>\n\n'; parse line-by-line, buffering
          // partial lines across chunk boundaries.
          let newline: number;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let ev: AgentEvent;
            try {
              ev = JSON.parse(payload) as AgentEvent;
            } catch {
              continue; // malformed frame — skip rather than kill the stream
            }
            handleEvent(ev);
          }
        }
        // The server always ends a turn with a done/error event; a stream that
        // just stops (network drop, function timeout) is an incomplete answer.
        if (!sawDone && !failed && !controller.signal.aborted) {
          failed = true;
          const message = "Connection lost — the answer may be incomplete.";
          patchLast((item) => ({ ...item, error: message }));
          toast.error(message);
        }
      } catch (err) {
        if (controller.signal.aborted) return null;
        failed = true;
        const message = err instanceof Error ? err.message : "Something went wrong";
        patchLast((item) => ({ ...item, error: message }));
        toast.error(message);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setStreaming(false);
        }
      }

      return failed ? null : finalText;
    },
    [patchLast],
  );

  return { transcript, streaming, send, stop, clear, note };
}
