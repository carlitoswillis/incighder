import { spawn } from "child_process";
import os from "os";
import { dataApiHeaders, getDataApiUrl } from "@/lib/data-api";
import { hasClaudeCli } from "@/lib/agent/cli-provider";

// Web search for the agent's web_search tool. Same provider chain idiom as
// knowledge/extract.ts: local Claude Code CLI with its WebSearch tool
// (subscription auth, real source URLs) → the home Mac's data-api /web_search
// bridge (same CLI through the tunnel) → Gemini google_search grounding
// (redirect-style source links, last resort). Throws only when every path
// fails.

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOutcome {
  results: WebResult[];
  note: string | null;
}

const CLI_TIMEOUT_MS = 90_000;
const BRIDGE_TIMEOUT_MS = 120_000;

// Enforced via --json-schema on the CLI paths (snake-free — matches the
// data-api bridge reply verbatim).
const WEB_SEARCH_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          snippet: { type: "string" },
        },
        required: ["title", "url", "snippet"],
      },
    },
    note: { type: ["string", "null"] },
  },
  required: ["results", "note"],
} as const;

function searchPrompt(query: string, limit: number): string {
  return (
    `Search the web for: ${query}\n` +
    `Use the WebSearch tool (one or two queries as needed). Return the ${limit} ` +
    "most relevant, current results. Real source URLs only — never " +
    "search-engine or redirect links. Each snippet is 1-2 sentences of what " +
    "that page actually says that is relevant to the query. Set `note` to a " +
    "one-sentence overall takeaway across results, or null."
  );
}

/** Strip optional ```json fences the model sometimes wraps around output. */
function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function toOutcome(raw: unknown, limit: number): WebSearchOutcome {
  if (!raw || typeof raw !== "object") {
    throw new Error("web search result is not an object");
  }
  const o = raw as Record<string, unknown>;
  const results = (Array.isArray(o.results) ? o.results : [])
    .map((r) => {
      const item = (r ?? {}) as Record<string, unknown>;
      return {
        title: typeof item.title === "string" ? item.title.trim() : "",
        url: typeof item.url === "string" ? item.url.trim() : "",
        snippet: typeof item.snippet === "string" ? item.snippet.trim() : "",
      };
    })
    .filter((r) => /^https?:\/\//.test(r.url))
    .slice(0, limit);
  return {
    results,
    note: typeof o.note === "string" && o.note.trim() ? o.note.trim() : null,
  };
}

// ── 1. Local Claude CLI ─────────────────────────────────────────────────────

/** One headless CLI call with only the WebSearch tool allowed — the CLI does
 * the searching and returns schema-enforced JSON. No `--tools ""` here; that
 * would disable the WebSearch tool this path depends on. */
function invokeSearchCli(prompt: string): Promise<string> {
  const model = process.env.GLO_CLI_MODEL || "sonnet";
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--model",
      model,
      "--json-schema",
      JSON.stringify(WEB_SEARCH_SCHEMA),
      "--strict-mcp-config",
      "--allowedTools",
      "WebSearch",
    ];
    const child = spawn("claude", args, { cwd: os.tmpdir() });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Claude CLI timed out after ${CLI_TIMEOUT_MS}ms.`));
    }, CLI_TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Claude CLI failed to start: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`claude exited ${code}: ${stderr.trim().slice(0, 300)}`));
    });
    child.stdin.on("error", () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseCliEnvelope(stdout: string, limit: number): WebSearchOutcome {
  let envelope: { result?: unknown; is_error?: boolean };
  try {
    envelope = JSON.parse(stdout) as typeof envelope;
  } catch {
    throw new Error("Claude CLI produced unparseable output.");
  }
  if (envelope.is_error) throw new Error("Claude CLI returned an error envelope.");
  if (typeof envelope.result === "string") {
    return toOutcome(JSON.parse(stripFences(envelope.result)), limit);
  }
  return toOutcome(envelope.result, limit);
}

// ── 2. data-api bridge ──────────────────────────────────────────────────────

async function searchViaDataApi(query: string, limit: number): Promise<WebSearchOutcome> {
  const url = await getDataApiUrl();
  const res = await fetch(`${url}/web_search`, {
    method: "POST",
    headers: dataApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ query, limit }),
    signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`web search bridge returned a non-JSON response (${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown> & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `web search bridge error (${res.status})`);
  }
  return toOutcome(data, limit);
}

// ── 3. Gemini google_search grounding ───────────────────────────────────────

async function searchWithGemini(
  apiKey: string,
  query: string,
  limit: number,
): Promise<WebSearchOutcome> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(CLI_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Gemini API error (${res.status})`);
  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: {
        groundingChunks?: { web?: { uri?: string; title?: string } }[];
      };
    }[];
  };
  const candidate = data.candidates?.[0];
  const seen = new Set<string>();
  const results: WebResult[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri ?? "";
    if (!/^https?:\/\//.test(uri) || seen.has(uri)) continue;
    seen.add(uri);
    results.push({ title: chunk.web?.title ?? uri, url: uri, snippet: "" });
    if (results.length >= limit) break;
  }
  if (!results.length) throw new Error("Gemini grounding returned no sources");
  const answer =
    candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  return { results, note: answer ? answer.slice(0, 600) : null };
}

// ── Chain ───────────────────────────────────────────────────────────────────

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function searchWeb(query: string, limit: number): Promise<WebSearchOutcome> {
  const errors: string[] = [];
  const prompt = searchPrompt(query, limit);
  if (hasClaudeCli()) {
    try {
      return parseCliEnvelope(await invokeSearchCli(prompt), limit);
    } catch (e) {
      errors.push(`cli: ${msg(e)}`);
    }
  }
  try {
    return await searchViaDataApi(query, limit);
  } catch (e) {
    errors.push(`bridge: ${msg(e)}`);
  }
  const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      return await searchWithGemini(geminiKey, query, limit);
    } catch (e) {
      errors.push(`gemini: ${msg(e)}`);
    }
  }
  throw new Error(
    `Web search failed: ${errors.join("; ") || "no web search provider available"}`,
  );
}
