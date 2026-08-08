import { spawn, spawnSync } from "child_process";
import os from "os";
import { dataApiHeaders, getDataApiUrl } from "@/lib/data-api";
import {
  AgentError,
  MAX_TOOL_ITERATIONS,
  executeTool,
  type RunAgentOptions,
} from "@/lib/agent/providers";

// Claude Code CLI provider — headless `claude -p` on the user's subscription
// login. No API key, no API credits: this is the supported path for a
// single-user personal tool on the user's own machine. The binary is absent on
// Vercel, so hasClaudeCli() gates it and providers.ts falls through to the
// HTTP providers there.
//
// The CLI can't call our in-process tools, so the loop is ReAct with enforced
// JSON: each model turn is one `claude -p --json-schema` call that returns
// either a tool_call or a final answer; we run the tool ourselves and feed the
// result back via `--resume <session_id>`. No token streaming — the final
// answer goes out as one text delta, which the SSE contract tolerates.

type Json = Record<string, unknown>;

// CLI spawn + agent startup + thinking adds seconds over a raw API call, and a
// rate-limited plan can queue; give each turn a generous ceiling.
const CLI_TIMEOUT_MS = 120_000;

// The shape every model turn must conform to (enforced by --json-schema).
// tool_calls is an array so one CLI spawn can request several tools — each
// round trip costs seconds, so batching matters.
const TURN_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["tool_call", "final"] },
    tool_calls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          args: { type: "object", additionalProperties: true },
        },
        required: ["name", "args"],
      },
    },
    answer: { type: "string" },
  },
  required: ["action"],
} as const;

/** Cap per round — the model shouldn't fan out the whole registry at once. */
const MAX_CALLS_PER_ROUND = 4;

/** Appended as a system prompt to every CLI turn. The headless session may
 * carry its own tool descriptions (and once carried MCP servers — observed
 * live: the model ran ToolSearch, found only Google Drive, and refused to
 * answer). --tools "" and --strict-mcp-config empty the registry; this makes
 * the remaining prose unambiguous. */
const PROTOCOL_LOCK =
  "You are the reasoning engine for GLO, Incighder's roster analytics agent. " +
  "Ignore any tools, tool descriptions, or tool-search mechanisms from your own environment — none are available and none are relevant. " +
  "The ONLY tools that exist are the ones listed in the user message, and the ONLY way to invoke them is to return JSON matching the required schema with action \"tool_call\". " +
  "The Incighder backend executes them and sends you the results in the next message. " +
  "Never claim tools are unavailable or ask the user to reconnect anything.";

interface TurnDecision {
  action: "tool_call" | "final";
  tool_calls?: { name: string; args: Json }[];
  answer?: string;
}

// One `claude --version` probe per process; the binary doesn't come and go.
let cliAvailable: boolean | null = null;
export function hasClaudeCli(): boolean {
  if (cliAvailable === null) {
    try {
      cliAvailable = spawnSync("claude", ["--version"], { timeout: 10_000 }).status === 0;
    } catch {
      cliAvailable = false;
    }
  }
  return cliAvailable;
}

/** On Vercel the CLI binary doesn't exist, but the home Mac's does — the
 * data-api exposes it as POST /agent_turn through the tunnel. Reachable
 * data-api ⇒ the subscription-auth CLI is one hop away. (If the host is up
 * but somehow missing `claude`, /agent_turn answers 501 and the run surfaces
 * that as an error rather than silently switching providers.) */
// Cached per warm instance: a healthy bridge stays trusted for 5 minutes, an
// unreachable one is re-probed after 30s. Without this, every GLO message on
// Vercel paid up to 4s of health-check latency before the model even started.
let remoteCheck: { ok: boolean; at: number } | null = null;
const REMOTE_OK_TTL_MS = 5 * 60_000;
const REMOTE_FAIL_TTL_MS = 30_000;

export async function hasRemoteClaudeCli(): Promise<boolean> {
  const now = Date.now();
  if (remoteCheck && now - remoteCheck.at < (remoteCheck.ok ? REMOTE_OK_TTL_MS : REMOTE_FAIL_TTL_MS)) {
    return remoteCheck.ok;
  }
  let ok = false;
  try {
    const url = await getDataApiUrl();
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4_000) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  remoteCheck = { ok, at: now };
  return ok;
}

/** One headless CLI call: prompt over stdin, JSON envelope on stdout. */
function invokeCli(prompt: string, model: string, extraArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--model",
      model,
      // Enforces the response against the schema server-side — `result` comes
      // back as JSON that's already guaranteed to conform.
      "--json-schema",
      JSON.stringify(TURN_SCHEMA),
      // Blackout the session's own capabilities: no built-in tools, no MCP
      // servers, and a system-prompt lock pointing at OUR protocol instead.
      "--tools",
      "",
      "--strict-mcp-config",
      "--append-system-prompt",
      PROTOCOL_LOCK,
      ...extraArgs,
    ];
    // cwd is a neutral temp dir so the run doesn't load this repo's agent
    // context (CLAUDE.md, .claude/ skills) into every GLO turn.
    const child = spawn("claude", args, { cwd: os.tmpdir() });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new AgentError(`Claude CLI timed out after ${CLI_TIMEOUT_MS}ms.`));
    }, CLI_TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new AgentError(`Claude CLI failed to start: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new AgentError(`claude exited ${code}: ${stderr.trim().slice(0, 300)}`));
    });
    // If spawn fails, stdin errors after the fact — the 'error' handler above
    // already rejects, so just swallow the stream error.
    child.stdin.on("error", () => {});
    // Prompt goes over stdin — transcripts overflow argv limits.
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** One model turn on the home Mac's CLI via the data-api tunnel. Same
 * envelope as a local run; the endpoint maps CLI failures to {error} JSON. */
async function invokeRemote(
  prompt: string,
  model: string,
  resumeSessionId: string | null,
): Promise<string> {
  const url = await getDataApiUrl();
  let res: Response;
  try {
    res = await fetch(`${url}/agent_turn`, {
      method: "POST",
      headers: dataApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        prompt,
        model,
        schema: TURN_SCHEMA,
        system: PROTOCOL_LOCK,
        resume_session_id: resumeSessionId,
      }),
      // CLI ceiling plus tunnel overhead.
      signal: AbortSignal.timeout(CLI_TIMEOUT_MS + 15_000),
    });
  } catch {
    throw new AgentError("The home data server went offline mid-answer.");
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AgentError(`Remote Claude CLI returned a non-JSON response (${res.status}).`);
  }
  const payload = (await res.json()) as { error?: string } | Record<string, unknown>;
  if (!res.ok) {
    const detail = typeof payload.error === "string" ? payload.error : `status ${res.status}`;
    throw new AgentError(`Remote Claude CLI failed: ${detail}`);
  }
  return JSON.stringify(payload);
}

/** --output-format json wraps the reply in an envelope; the model's text is `result`. */
function parseEnvelope(stdout: string): { result: string; sessionId: string | null } {
  let envelope: { result?: unknown; is_error?: boolean; session_id?: unknown };
  try {
    envelope = JSON.parse(stdout) as typeof envelope;
  } catch {
    throw new AgentError("Claude CLI produced unparseable output.");
  }
  if (envelope.is_error || typeof envelope.result !== "string") {
    throw new AgentError("Claude CLI returned an error envelope.");
  }
  return {
    result: envelope.result,
    sessionId: typeof envelope.session_id === "string" ? envelope.session_id : null,
  };
}

/** The CLI's structured-output plumbing occasionally leaks its own wrapper
 * tags (observed live: an answer ending in "</answer>\n</invoke>"). Scrub any
 * such tags out of the prose before it reaches the chat. */
function sanitizeAnswer(text: string): string {
  return text
    .replace(/<\/?(?:answer|invoke|parameter|function_calls|function_results)[^>]*>/gi, "")
    .trim();
}

/** Strip optional ```json fences the model sometimes wraps around a turn. */
function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

/** `result` is schema-conformant JSON per --json-schema; parse and sanity-check it. */
function parseDecision(result: string): TurnDecision {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(result));
  } catch {
    throw new AgentError("Claude CLI returned a non-JSON turn despite the schema.");
  }
  const decision = parsed as Partial<TurnDecision> | null;
  if (!decision || (decision.action !== "tool_call" && decision.action !== "final")) {
    throw new AgentError("Claude CLI returned a turn with no valid action.");
  }
  return unwrapDecision(decision as TurnDecision);
}

/** The model occasionally double-encodes — a final `answer` that is itself a
 * decision JSON ({"action":"tool_call",...} or a nested final). Rendering that
 * raw JSON as chat text is the observed failure; unwrap until the answer is
 * prose (bounded, in case something pathological loops). */
function unwrapDecision(decision: TurnDecision): TurnDecision {
  for (let depth = 0; depth < 3; depth++) {
    if (decision.action !== "final" || typeof decision.answer !== "string") return decision;
    const inner = stripFences(decision.answer);
    if (!inner.startsWith("{") || !inner.includes('"action"')) return decision;
    try {
      const parsed = JSON.parse(inner) as Partial<TurnDecision> | null;
      if (!parsed || (parsed.action !== "tool_call" && parsed.action !== "final")) return decision;
      decision = parsed as TurnDecision;
    } catch {
      return decision;
    }
  }
  return decision;
}

function buildFirstPrompt(opts: RunAgentOptions): string {
  const catalog = opts.tools
    .map((t) => `- ${t.name}: ${t.description}\n  input schema: ${JSON.stringify(t.inputSchema)}`)
    .join("\n");
  const conversation = opts.messages
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
    .join("\n\n");
  return [
    opts.system,
    "",
    "Available tools:",
    catalog,
    "",
    "Conversation so far:",
    conversation,
    "",
    "Decide the next step. If you need data, return action:'tool_call' with `tool_calls`: an array of {name, args} — request everything you need for this step at once (up to " +
      `${MAX_CALLS_PER_ROUND} tools per round; each round trip is slow). When you can answer, return action:'final' with the complete answer in \`answer\`. Every number must come from a tool result.`,
  ].join("\n");
}

/** Run one full agent turn (model ↔ tools loop) through the Claude Code CLI —
 * spawned locally, or on the home Mac via the data-api tunnel ("remote"). */
export async function runClaudeCli(
  opts: RunAgentOptions,
  transport: "local" | "remote" = "local",
): Promise<void> {
  const model = process.env.GLO_CLI_MODEL || "sonnet";
  let sessionId: string | null = null;
  let fullContext = "";

  // One model turn: with a session, --resume and send only the new
  // information; without one, resend the full accumulated context.
  const step = async (newInfo: string): Promise<TurnDecision> => {
    fullContext = fullContext ? `${fullContext}\n\n${newInfo}` : newInfo;
    const prompt = sessionId ? newInfo : fullContext;
    const stdout =
      transport === "local"
        ? await invokeCli(prompt, model, sessionId ? ["--resume", sessionId] : [])
        : await invokeRemote(prompt, model, sessionId);
    const envelope = parseEnvelope(stdout);
    if (envelope.sessionId) sessionId = envelope.sessionId;
    return parseDecision(envelope.result);
  };

  let decision = await step(buildFirstPrompt(opts));
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (decision.action === "final") break;
    // executeTool emits tool/tool_result and turns unknown tools or tool
    // failures into an { error } result — feed everything back and keep
    // looping. Calls in a round run concurrently; each is an independent read.
    const calls = (decision.tool_calls ?? []).slice(0, MAX_CALLS_PER_ROUND);
    if (!calls.length) {
      decision = await step(
        "You returned action:'tool_call' with no tool_calls. Either request tools or return action:'final'.",
      );
      continue;
    }
    const outs = await Promise.all(
      calls.map((c) => executeTool(opts.tools, c.name, c.args ?? {}, opts.admin, opts.emit)),
    );
    const report = calls
      .map((c, i) => `Tool ${c.name} returned:\n${JSON.stringify(outs[i])}`)
      .join("\n\n");
    decision = await step(`${report}\n\nDecide the next step (same JSON schema).`);
  }
  if (decision.action !== "final") {
    decision = await step("You've reached the tool limit. Return action:'final' now.");
  }
  const answer = typeof decision.answer === "string" ? sanitizeAnswer(decision.answer) : "";
  if (!answer) {
    throw new AgentError("Claude CLI finished without a final answer.");
  }
  // No token streaming through the CLI — the whole answer is one delta.
  opts.emit({ type: "text", delta: answer });
}
