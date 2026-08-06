import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { agentTools } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { runAgentTurn, type AgentSSEEvent, type ChatMessage } from "@/lib/agent/providers";

// The GLO endpoint: POST a chat transcript, get an SSE stream of tool
// progress + streamed assistant text. The stream ALWAYS ends with a done or
// error event — any thrown error is converted, never a broken pipe.

export const maxDuration = 120; // refresh_artist alone can take ~2 minutes
export const dynamic = "force-dynamic";

interface AgentRequestBody {
  messages?: unknown;
  context?: { artistId?: unknown; group?: unknown };
}

const MAX_MESSAGE_CHARS = 4000; // per-message cap — anything longer is truncated
const MAX_BODY_CHARS = 60_000; // total transcript cap — beyond this we 413

// Per-IP fixed-window rate limiter. Kept in module scope, so it is
// per-instance — fine for a single-user app; a multi-instance deploy would
// need shared storage.
const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  // Opportunistically prune stale windows so the map can't grow unbounded.
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

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: ChatMessage[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      messages.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
    }
  }
  return messages.slice(-30); // cap context — the agent re-fetches data anyway
}

function totalContentChars(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  let total = 0;
  for (const m of raw) {
    const content = (m as { content?: unknown })?.content;
    if (typeof content === "string") total += content.length;
  }
  return total;
}

export async function POST(request: Request) {
  let body: AgentRequestBody = {};
  try {
    body = ((await request.json()) as AgentRequestBody | null) ?? {};
  } catch {
    // fall through — an empty transcript becomes an error event on the stream
  }
  if (totalContentChars(body.messages) > MAX_BODY_CHARS) {
    return Response.json({ error: "Transcript too large." }, { status: 413 });
  }
  // GLO is an advanced feature: passphrase-gated like the rest of them.
  const admin = await isAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Rate-limit even admins lightly — a stuck client shouldn't spin the LLM.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (isRateLimited(ip)) {
    return Response.json({ error: "Rate limited — try again shortly." }, { status: 429 });
  }
  const messages = parseMessages(body.messages);

  // Groups for the system prompt — fail soft to [] so the agent still answers
  // when the DB is momentarily unreachable.
  let groups: { group_name: string; count: number }[] = [];
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT group_name, COUNT(*) AS count FROM artists
       WHERE group_name IS NOT NULL ${admin ? "" : "AND is_public = 1"}
       GROUP BY group_name ORDER BY group_name`,
    );
    groups = rows.map((r) => ({ group_name: String(r.group_name), count: Number(r.count) }));
  } catch (e) {
    console.error("Agent groups lookup failed:", e);
  }

  // Current-page artist context. Private artists behave as nonexistent for
  // visitors — an invisible artistId simply contributes no context.
  let pageArtist: { id: string; name: string } | undefined;
  const artistId = body.context?.artistId;
  if (typeof artistId === "string" && artistId) {
    try {
      const [rows] = await getPool().query<RowDataPacket[]>(
        "SELECT id, name, is_public FROM artists WHERE id = ?",
        [artistId],
      );
      if (rows.length && (admin || rows[0].is_public)) {
        pageArtist = { id: String(rows[0].id), name: String(rows[0].name) };
      }
    } catch (e) {
      console.error("Agent page-artist lookup failed:", e);
    }
  }

  const system = buildSystemPrompt({
    admin,
    date: new Date().toISOString().slice(0, 10),
    groups,
    pageArtist,
    pageGroup: typeof body.context?.group === "string" ? body.context.group : undefined,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (ev: AgentSSEEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          closed = true; // client went away — stop writing
        }
      };
      try {
        if (!messages.length) {
          emit({ type: "error", message: "Send at least one user message." });
        } else {
          const ok = await runAgentTurn({ messages, system, tools: agentTools, admin, emit });
          if (ok) emit({ type: "done" });
        }
      } catch (e) {
        // runAgentTurn catches its own errors; this guards everything else.
        console.error("Agent stream failed:", e);
        emit({ type: "error", message: e instanceof Error ? e.message : "Agent failed." });
      }
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
