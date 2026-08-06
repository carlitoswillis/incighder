import type { AgentTool } from "@/lib/agent/tools";
import { hasClaudeCli, hasRemoteClaudeCli, runClaudeCli } from "@/lib/agent/cli-provider";

// LLM providers for the /api/agent brain. Raw fetch against the Anthropic and
// Gemini streaming APIs — no SDK dependency — plus the local Claude Code CLI
// (cli-provider.ts). runAgentTurn owns the whole tool loop and reports
// progress through emit() as SSE-shaped events; the route just serializes them
// onto the wire.

export type AgentSSEEvent =
  | { type: "tool"; name: string; label: string }
  | { type: "tool_result"; name: string; ok: boolean; summary: string }
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type Emit = (event: AgentSSEEvent) => void;
type Json = Record<string, unknown>;

export interface RunAgentOptions {
  messages: ChatMessage[];
  system: string;
  tools: AgentTool[];
  admin: boolean;
  emit: Emit;
}

export const MAX_TOOL_ITERATIONS = 8;
const MAX_TOKENS = 2048;
const CONCLUDE_PROMPT =
  "You have reached the tool-call limit for this turn. Conclude now with your best answer from the tool results you already have — do not request any more tools.";

export class AgentError extends Error {}

/**
 * Run one full agent turn (model ↔ tools loop) against whichever provider is
 * configured. Returns true on success; on failure emits an error event and
 * returns false so the caller knows not to emit done.
 */
export async function runAgentTurn(opts: RunAgentOptions): Promise<boolean> {
  try {
    const forced = process.env.GLO_PROVIDER;
    if (forced === "cli") {
      if (hasClaudeCli()) {
        await runClaudeCli(opts, "local");
      } else if (await hasRemoteClaudeCli()) {
        await runClaudeCli(opts, "remote");
      } else {
        opts.emit({
          type: "error",
          message:
            "GLO_PROVIDER=cli, but no `claude` CLI was found locally and the home data server (remote CLI) is unreachable. Install/log into Claude Code, bring the data-api online, or unset GLO_PROVIDER.",
        });
        return false;
      }
    } else if (forced === "anthropic") {
      await runAnthropic(opts);
    } else if (forced === "gemini") {
      await runGemini(opts);
    } else if (hasClaudeCli()) {
      await runClaudeCli(opts, "local");
      // Subscription auth beats metered keys: on Vercel (no local CLI), reach
      // the home Mac's CLI through the data-api tunnel before burning API
      // credits. Falls through when the Mac is offline.
    } else if (await hasRemoteClaudeCli()) {
      await runClaudeCli(opts, "remote");
    } else if (process.env.ANTHROPIC_API_KEY) {
      await runAnthropic(opts);
    } else if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) {
      await runGemini(opts);
    } else {
      opts.emit({
        type: "error",
        message:
          "No LLM configured. Log into the Claude Code CLI on this machine (or bring the home data server online), or set ANTHROPIC_API_KEY (recommended) or GOOGLE_AI_API_KEY in .env.",
      });
      return false;
    }
    return true;
  } catch (e) {
    console.error("Agent provider failed:", e);
    opts.emit({
      type: "error",
      message: e instanceof Error ? e.message : "The agent failed unexpectedly.",
    });
    return false;
  }
}

// ── Shared plumbing ─────────────────────────────────────────────────────────

/** 2 retries with backoff on 429/5xx/529. Error messages carry status only — never the key. */
async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
    }
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      lastStatus = res.status;
      if (res.status !== 429 && res.status < 500) {
        const text = await res.text().catch(() => "");
        throw new AgentError(
          `${label} request failed (status ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
        );
      }
    } catch (e) {
      if (e instanceof AgentError) throw e;
      if (attempt === 2) throw new AgentError(`${label} is unreachable (network error).`);
    }
  }
  throw new AgentError(
    `${label} request failed after retries (status ${lastStatus || "network error"}). Try again shortly.`,
  );
}

/** Feed each `data: {...}` SSE payload to onData as parsed JSON. */
async function forEachSSEData(res: Response, onData: (data: Json) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new AgentError("LLM response had no body.");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        onData(JSON.parse(payload) as Json);
      } catch {
        // keepalive / partial line — ignore
      }
    }
  }
}

export async function executeTool(
  tools: AgentTool[],
  name: string,
  input: Json,
  admin: boolean,
  emit: Emit,
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  let label = name;
  if (tool) {
    try {
      label = tool.label(input);
    } catch {
      // fall back to the tool name
    }
  }
  emit({ type: "tool", name, label });

  let out: unknown;
  if (!tool) {
    out = { error: `Unknown tool: ${name}` };
  } else {
    try {
      out = await tool.run(input, { admin });
    } catch (e) {
      console.error(`Agent tool ${name} failed:`, e);
      out = { error: `Tool ${name} failed: ${e instanceof Error ? e.message : "unknown error"}` };
    }
  }
  const ok = !(out && typeof out === "object" && !Array.isArray(out) && "error" in out);
  emit({ type: "tool_result", name, ok, summary: summarizeResult(out) });
  return out;
}

/** Short one-line outcome for the tool_result event. */
function summarizeResult(out: unknown): string {
  if (out == null) return "no result";
  if (typeof out !== "object") return String(out).slice(0, 120);
  if (Array.isArray(out)) return `${out.length} rows`;
  const o = out as Json;
  if (typeof o.error === "string") return o.error.slice(0, 120);
  if ("error" in o) return "error";
  if (typeof o.note === "string") return o.note.slice(0, 120);
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) return `${v.length} ${k}`;
  }
  const keys = Object.keys(o);
  return keys.length ? `ok (${keys.slice(0, 6).join(", ")})` : "ok";
}

// ── Anthropic ───────────────────────────────────────────────────────────────

interface AnthropicTurn {
  content: unknown[];
  stopReason: string | null;
  toolUses: { id: string; name: string; input: Json }[];
}

async function runAnthropic(opts: RunAgentOptions): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY as string;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const tools = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
  const conversation: { role: string; content: unknown }[] = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let iteration = 0;
  for (;;) {
    const finalTurn = iteration >= MAX_TOOL_ITERATIONS;
    if (finalTurn) conversation.push({ role: "user", content: CONCLUDE_PROMPT });

    const body: Json = {
      model,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: opts.system,
      messages: conversation,
      // Always send tools — history contains tool_use/tool_result blocks, and
      // the API 400s if they reference tools absent from the request.
      tools,
    };
    if (finalTurn) body.tool_choice = { type: "none" };

    const res = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
      "Anthropic",
    );

    const turn = await consumeAnthropicStream(res, opts.emit);

    if (!finalTurn && turn.stopReason === "tool_use" && turn.toolUses.length) {
      conversation.push({ role: "assistant", content: turn.content });
      const results: Json[] = [];
      for (const tu of turn.toolUses) {
        const out = await executeTool(opts.tools, tu.name, tu.input, opts.admin, opts.emit);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        });
      }
      conversation.push({ role: "user", content: results });
      iteration++;
      continue;
    }
    return;
  }
}

async function consumeAnthropicStream(res: Response, emit: Emit): Promise<AnthropicTurn> {
  type Block =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; inputJson: string }
    | { type: "thinking"; thinking: string; signature: string }
    | { type: "redacted_thinking"; data: string };
  const blocks = new Map<number, Block>();
  let stopReason: string | null = null;

  await forEachSSEData(res, (ev) => {
    switch (ev.type) {
      case "content_block_start": {
        const idx = Number(ev.index);
        const cb = (ev.content_block ?? {}) as Json;
        if (cb.type === "tool_use") {
          blocks.set(idx, {
            type: "tool_use",
            id: String(cb.id ?? ""),
            name: String(cb.name ?? ""),
            inputJson: "",
          });
        } else if (cb.type === "text") {
          const initial = typeof cb.text === "string" ? cb.text : "";
          if (initial) emit({ type: "text", delta: initial });
          blocks.set(idx, { type: "text", text: initial });
        } else if (cb.type === "thinking") {
          // Track thinking blocks so they can be echoed back verbatim in the
          // tool-use follow-up — omitting them 400s when the model thinks.
          blocks.set(idx, {
            type: "thinking",
            thinking: typeof cb.thinking === "string" ? cb.thinking : "",
            signature: typeof cb.signature === "string" ? cb.signature : "",
          });
        } else if (cb.type === "redacted_thinking") {
          blocks.set(idx, { type: "redacted_thinking", data: String(cb.data ?? "") });
        }
        break;
      }
      case "content_block_delta": {
        const idx = Number(ev.index);
        const delta = (ev.delta ?? {}) as Json;
        const block = blocks.get(idx);
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          emit({ type: "text", delta: delta.text });
          if (block?.type === "text") block.text += delta.text;
        } else if (
          delta.type === "input_json_delta" &&
          block?.type === "tool_use" &&
          typeof delta.partial_json === "string"
        ) {
          block.inputJson += delta.partial_json;
        } else if (
          delta.type === "thinking_delta" &&
          block?.type === "thinking" &&
          typeof delta.thinking === "string"
        ) {
          block.thinking += delta.thinking;
        } else if (
          delta.type === "signature_delta" &&
          block?.type === "thinking" &&
          typeof delta.signature === "string"
        ) {
          block.signature = delta.signature;
        }
        break;
      }
      case "message_delta": {
        const d = (ev.delta ?? {}) as Json;
        if (d.stop_reason) stopReason = String(d.stop_reason);
        break;
      }
      case "error": {
        const err = (ev.error ?? {}) as Json;
        throw new AgentError(`Anthropic stream error: ${String(err.message ?? "unknown")}`);
      }
    }
  });

  const content: unknown[] = [];
  const toolUses: AnthropicTurn["toolUses"] = [];
  for (const [, block] of [...blocks.entries()].sort((a, b) => a[0] - b[0])) {
    if (block.type === "text") {
      if (block.text) content.push({ type: "text", text: block.text });
    } else if (block.type === "thinking") {
      content.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
    } else if (block.type === "redacted_thinking") {
      content.push({ type: "redacted_thinking", data: block.data });
    } else {
      let input: Json = {};
      try {
        input = block.inputJson ? (JSON.parse(block.inputJson) as Json) : {};
      } catch {
        // malformed partial JSON — run the tool with empty args rather than crash
      }
      content.push({ type: "tool_use", id: block.id, name: block.name, input });
      toolUses.push({ id: block.id, name: block.name, input });
    }
  }
  return { content, stopReason, toolUses };
}

// ── Gemini ──────────────────────────────────────────────────────────────────

interface GeminiTurn {
  parts: Json[];
  functionCalls: { name: string; args: Json }[];
}

async function runGemini(opts: RunAgentOptions): Promise<void> {
  const apiKey = (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) as string;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  const declarations = opts.tools.map((t) => {
    const params = geminiSchema(t.inputSchema) as Json;
    const props = params?.properties as Json | undefined;
    const decl: Json = { name: t.name, description: t.description };
    // Gemini rejects OBJECT schemas with no properties — omit parameters instead.
    if (props && Object.keys(props).length) decl.parameters = params;
    return decl;
  });

  const contents: Json[] = opts.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let iteration = 0;
  for (;;) {
    const finalTurn = iteration >= MAX_TOOL_ITERATIONS;
    if (finalTurn) contents.push({ role: "user", parts: [{ text: CONCLUDE_PROMPT }] });

    const body: Json = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      // No thinking budget, and more room than Anthropic's MAX_TOKENS —
      // otherwise Gemini's thinking can consume the whole output budget and
      // yield an empty answer.
      generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
    };
    if (!finalTurn && declarations.length) body.tools = [{ functionDeclarations: declarations }];

    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      "Gemini",
    );

    const turn = await consumeGeminiStream(res, opts.emit);

    if (!finalTurn && turn.functionCalls.length) {
      // Echo the model turn (text + functionCall parts) before the responses.
      contents.push({ role: "model", parts: turn.parts.length ? turn.parts : [{ text: "" }] });
      const responses: Json[] = [];
      for (const call of turn.functionCalls) {
        const out = await executeTool(opts.tools, call.name, call.args, opts.admin, opts.emit);
        const response: Json =
          out && typeof out === "object" && !Array.isArray(out) ? (out as Json) : { result: out };
        responses.push({ functionResponse: { name: call.name, response } });
      }
      contents.push({ role: "user", parts: responses });
      iteration++;
      continue;
    }
    return;
  }
}

async function consumeGeminiStream(res: Response, emit: Emit): Promise<GeminiTurn> {
  const parts: Json[] = [];
  const functionCalls: GeminiTurn["functionCalls"] = [];
  let finishReason: string | null = null;
  let blockReason: string | null = null;

  await forEachSSEData(res, (chunk) => {
    const err = chunk.error as { message?: string } | undefined;
    if (err) throw new AgentError(`Gemini stream error: ${err.message ?? "unknown"}`);
    const feedback = chunk.promptFeedback as { blockReason?: string } | undefined;
    if (feedback?.blockReason) blockReason = String(feedback.blockReason);
    const candidates = chunk.candidates as
      | { content?: { parts?: Json[] }; finishReason?: string }[]
      | undefined;
    if (candidates?.[0]?.finishReason) finishReason = String(candidates[0].finishReason);
    // Gemini may not stream text before functionCalls — buffer every part for
    // the model echo, and emit text deltas as they arrive.
    for (const part of candidates?.[0]?.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text) {
        emit({ type: "text", delta: part.text });
        parts.push({ text: part.text });
      } else if (part.functionCall && typeof part.functionCall === "object") {
        const fc = part.functionCall as { name?: string; args?: Json };
        const call = { name: String(fc.name ?? ""), args: (fc.args ?? {}) as Json };
        functionCalls.push(call);
        parts.push({ functionCall: { name: call.name, args: call.args } });
      }
    }
  });

  // A stream with no text and no tool calls would otherwise end as a silent
  // empty answer — surface the block/finish reason as an SSE error instead.
  if (!parts.length && !functionCalls.length) {
    const reason = blockReason
      ? `prompt blocked (${blockReason})`
      : finishReason
        ? `finished with no output (${finishReason})`
        : "no output";
    throw new AgentError(`Gemini returned an empty response: ${reason}.`);
  }

  return { parts, functionCalls };
}

/** JSON Schema → Gemini schema: UPPERCASE type names, unsupported keys dropped. */
function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (schema && typeof schema === "object") {
    const out: Json = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "additionalProperties" || k === "$schema" || k === "default") continue;
      if (k === "type" && typeof v === "string") {
        out[k] = v.toUpperCase();
      } else if (k === "properties" && v && typeof v === "object") {
        out[k] = Object.fromEntries(
          Object.entries(v as Json).map(([pk, pv]) => [pk, geminiSchema(pv)]),
        );
      } else if (k === "items") {
        out[k] = geminiSchema(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return schema;
}
