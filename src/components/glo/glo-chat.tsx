"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Eraser,
  Headphones,
  Loader2,
  Mic,
  Paperclip,
  SendHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MarkdownLite } from "./markdown-lite";
import {
  useAgentStream,
  type AgentContext,
  type ToolActivity,
  type TranscriptItem,
} from "./use-agent-stream";
import { useSpeaker, useSpeechInput } from "./use-voice";

// Artist sub-routes that are pages of their own, not artist detail views.
const NON_ARTIST_SEGMENTS = new Set(["add", "bulk", "refresh"]);

function contextFromPathname(pathname: string): AgentContext | undefined {
  const artist = pathname.match(/^\/artists\/([^/]+)/);
  if (artist && !NON_ARTIST_SEGMENTS.has(artist[1])) {
    return { artistId: decodeURIComponent(artist[1]) };
  }
  const group = pathname.match(/^\/g\/([^/]+)/);
  if (group) return { group: decodeURIComponent(group[1]) };
  return undefined;
}

function ActivityRow({
  activity,
  streaming,
}: {
  activity: ToolActivity;
  streaming: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
      {activity.ok === undefined ? (
        streaming ? (
          <Loader2 className="size-3 shrink-0 animate-spin motion-reduce:animate-none" />
        ) : (
          <X className="size-3 shrink-0 text-destructive" />
        )
      ) : activity.ok ? (
        <Check className="size-3 shrink-0 text-emerald-400" />
      ) : (
        <X className="size-3 shrink-0 text-destructive" />
      )}
      <span className="truncate">
        {activity.label}
        {activity.summary ? (
          <span className="not-italic opacity-80"> — {activity.summary}</span>
        ) : null}
      </span>
    </div>
  );
}

function MessageBubble({
  item,
  streaming,
}: {
  item: TranscriptItem;
  streaming: boolean;
}) {
  if (item.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary/15 px-3 py-2 text-sm break-words whitespace-pre-wrap">
          {item.content}
        </div>
      </div>
    );
  }
  const pending = streaming && !item.content && !item.error;
  return (
    <div className="flex flex-col gap-1.5">
      {(item.activity ?? []).map((activity, i) => (
        <ActivityRow key={i} activity={activity} streaming={streaming} />
      ))}
      {pending && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" />
      )}
      {item.content && (
        <div className="max-w-[95%] rounded-xl rounded-bl-sm bg-secondary/60 px-3 py-2">
          <MarkdownLite text={item.content} />
        </div>
      )}
      {item.error && (
        <div className="max-w-[95%] rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {item.error}
        </div>
      )}
    </div>
  );
}

export function GloChat({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const context = useMemo(() => contextFromPathname(pathname ?? "/"), [pathname]);

  const { transcript, streaming, send, clear, note } = useAgentStream();
  const speaker = useSpeaker();
  const [input, setInput] = useState("");
  const [artistName, setArtistName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const speakerRef = useRef(speaker);
  speakerRef.current = speaker;

  // Hands-free conversation mode: listen → answer → speak → listen again.
  // The ref mirrors the state so async turn completions see the live value.
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const voiceRef = useRef<{ start: () => Promise<void>; stop: (send?: boolean) => void } | null>(
    null,
  );

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setInput("");
      // A fresh turn silences whatever GLO was still saying.
      speakerRef.current.cancel();
      void send(trimmed, context).then(async (finalText) => {
        if (finalText && (speakerRef.current.enabled || voiceModeRef.current)) {
          await speakerRef.current.speak(finalText);
        }
        if (voiceModeRef.current) {
          if (finalText) {
            void voiceRef.current?.start();
          } else {
            // A failed turn ends the loop rather than re-arming the mic
            // against whatever just went wrong.
            voiceModeRef.current = false;
            setVoiceMode(false);
          }
        }
      });
    },
    [streaming, send, context],
  );

  // Paperclip → knowledgebase: uploads go through the same extraction flow as
  // the /knowledge page, attached to the current page's artist when there is
  // one. Extraction runs a vision model, so this can take a minute.
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadDoc = useCallback(
    async (file: File) => {
      if (file.size > 24 * 1024 * 1024) {
        toast.error("Max 24 MB — that file is too large to save.");
        return;
      }
      setUploading(true);
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
          reader.onerror = () => reject(new Error("Could not read the file."));
          reader.readAsDataURL(file);
        });
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_b64: b64,
            file_mime: file.type || "application/octet-stream",
            file_name: file.name,
            ...(context?.artistId ? { artist_id: context.artistId } : {}),
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          item?: { id: number; title: string; artist_name: string | null };
          error?: string;
        } | null;
        if (!res.ok || !data?.item) {
          throw new Error(data?.error || `Upload failed (${res.status}).`);
        }
        note(
          `Saved **${data.item.title}** to the knowledgebase` +
            (data.item.artist_name ? `, attached to ${data.item.artist_name}` : "") +
            ` (item #${data.item.id}). Ask me about it any time.`,
        );
        toast.success("Saved to the knowledgebase");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [context, note],
  );

  const voice = useSpeechInput({
    onFinal: (text) => submit(text),
    onError: (message) => {
      toast.error(message);
      // Same principle: errors break the hands-free loop.
      voiceModeRef.current = false;
      setVoiceMode(false);
    },
  });
  voiceRef.current = voice;

  const toggleVoiceMode = useCallback(() => {
    if (voiceModeRef.current) {
      voiceModeRef.current = false;
      setVoiceMode(false);
      voice.stop(false);
      speakerRef.current.cancel();
    } else {
      // The toggle tap doubles as the iOS audio unlock, so the spoken reply
      // can start without another tap.
      speakerRef.current.unlock();
      voiceModeRef.current = true;
      setVoiceMode(true);
      void voice.start();
    }
  }, [voice]);

  // Name for the "Pitch prep" chip when sitting on an artist page.
  useEffect(() => {
    setArtistName(null);
    if (!context?.artistId) return;
    let alive = true;
    fetch(`/api/artists/${encodeURIComponent(context.artistId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { name?: string } | null) => {
        if (alive && data?.name) setArtistName(data.name);
      })
      .catch(() => {
        // Chip falls back to a generic label — not worth surfacing.
      });
    return () => {
      alive = false;
    };
  }, [context?.artistId]);

  // Keep the newest content in view as it streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, streaming]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const chips = useMemo(() => {
    const generic = [
      "Roster pulse — what changed this week?",
      "Who's gaining momentum right now?",
      "Which posts are driving growth?",
    ];
    if (context?.artistId) {
      return [...generic, `Pitch prep for ${artistName ?? "this artist"}`];
    }
    if (context?.group) {
      return [...generic, `How is ${context.group} doing?`];
    }
    return generic;
  }, [context, artistName]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <span
          className="size-2 rounded-full bg-primary shadow-[0_0_6px] shadow-primary/60 motion-safe:animate-pulse"
          aria-hidden
        />
        <span className="text-sm font-semibold tracking-tight">GLO</span>
        <div className="ml-auto flex items-center gap-1">
          {voice.supported && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={voiceMode ? "End voice conversation" : "Start voice conversation"}
              aria-pressed={voiceMode}
              onClick={toggleVoiceMode}
              className={cn(voiceMode ? "text-primary" : "text-muted-foreground")}
            >
              <Headphones />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={speaker.enabled ? "Turn voice replies off" : "Turn voice replies on"}
            aria-pressed={speaker.enabled}
            onClick={speaker.toggle}
            className={cn(!speaker.enabled && "text-muted-foreground")}
          >
            {speaker.enabled ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear conversation"
            onClick={() => {
              speaker.cancel();
              clear();
            }}
            className="text-muted-foreground"
          >
            <Eraser />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close GLO"
            onClick={onClose}
            className="text-muted-foreground"
          >
            <XIcon />
          </Button>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {transcript.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
            <Sparkles className="size-6 text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Ask about your roster — growth, momentum, posts, pitch prep.
              GLO pulls live numbers and explains what changed.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => submit(chip)}
                  className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground/90 transition-colors outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {transcript.map((item, i) => (
              <MessageBubble
                key={i}
                item={item}
                streaming={streaming && i === transcript.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        className="flex shrink-0 items-end gap-1.5 border-t border-border p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(input);
            }
          }}
          rows={1}
          placeholder={
            voice.listening ? "Listening…" : voice.processing ? "Transcribing…" : "Ask GLO…"
          }
          aria-label="Message GLO"
          className="max-h-28 min-h-9 flex-1 resize-none rounded-lg border border-input bg-background/50 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*,text/plain,text/markdown,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadDoc(file);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Save a document to the knowledgebase"
          disabled={uploading || streaming}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 text-muted-foreground"
        >
          {uploading ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Paperclip />
          )}
        </Button>
        {voice.supported && (
          <Button
            type="button"
            variant={voice.listening ? "secondary" : "ghost"}
            size="icon"
            aria-label={voice.listening ? "Done talking" : "Speak your question"}
            aria-pressed={voice.listening}
            onClick={voice.toggle}
            disabled={voice.processing}
            className="relative shrink-0"
          >
            {voice.processing ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Mic className={cn(voice.listening && "text-red-400")} />
            )}
            {voice.listening && (
              <span
                className="absolute top-1 right-1 size-1.5 rounded-full bg-red-500 motion-safe:animate-pulse"
                aria-hidden
              />
            )}
          </Button>
        )}
        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          disabled={streaming || !input.trim()}
          className="shrink-0"
        >
          {streaming ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <SendHorizontal />}
        </Button>
      </form>
    </div>
  );
}
