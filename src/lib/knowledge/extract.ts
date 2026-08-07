import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { dataApiHeaders, getDataApiUrl } from "@/lib/data-api";
import { hasClaudeCli } from "@/lib/agent/cli-provider";

// Vision/document extraction for knowledgebase uploads. Provider chain, first
// available wins: local Claude CLI (subscription auth, no API key) → the home
// Mac's data-api /extract_doc bridge (same CLI through the tunnel) → Anthropic
// API → Gemini. Throws only when every path fails.

export interface Extraction {
  title: string;
  text: string;
  summary: string;
  tags: string[];
  suggestedArtist: string | null;
}

const CLI_TIMEOUT_MS = 120_000;
const BRIDGE_TIMEOUT_MS = 150_000;

// Enforced via --json-schema on the CLI paths; the API paths are asked for
// the same shape in the prompt. snake_case matches the data-api bridge.
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    text: { type: "string" },
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    suggested_artist: { type: ["string", "null"] },
  },
  required: ["title", "text", "summary", "tags", "suggested_artist"],
} as const;

const EXTRACT_INSTRUCTIONS =
  "Transcribe ALL visible text verbatim and completely into `text` — every slide, page, and region, " +
  "including numbers, tables, and contact info. Then produce `title` (a short descriptive title), " +
  "`summary` (2-3 sentences), `tags` (3-8 lowercase tags), and `suggested_artist` " +
  "(the primary artist/person name if evident from the content, else null).";

const MIME_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
};

function extensionFor(mime: string, fileName?: string): string {
  if (MIME_EXT[mime]) return MIME_EXT[mime];
  const ext = fileName ? path.extname(fileName) : "";
  return ext || ".bin";
}

/** Strip optional ```json fences the model sometimes wraps around output. */
function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

/** Normalize a raw model result (either key style) into an Extraction. */
function toExtraction(raw: unknown): Extraction {
  if (!raw || typeof raw !== "object") {
    throw new Error("extraction result is not an object");
  }
  const o = raw as Record<string, unknown>;
  const artist = o.suggested_artist ?? o.suggestedArtist;
  const tags = Array.isArray(o.tags)
    ? o.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];
  return {
    title: typeof o.title === "string" ? o.title.trim() : "",
    text: typeof o.text === "string" ? o.text : "",
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    tags,
    suggestedArtist:
      typeof artist === "string" && artist.trim() ? artist.trim() : null,
  };
}

// ── 1. Local Claude CLI ─────────────────────────────────────────────────────

/** One headless CLI call mirroring cli-provider's invokeCli, but with the Read
 * tool allowed — the model reads the temp file itself. IMPORTANT: no
 * `--tools ""` here; that would disable the Read tool this path depends on.
 * Read is scoped to the temp file only (`Read(//abs/path)` permission-rule
 * syntax): uploaded documents are untrusted, and an unscoped Read would let
 * injected instructions in one pull host files (.env etc.) into the result. */
function invokeExtractCli(prompt: string, filePath: string): Promise<string> {
  const model = process.env.GLO_CLI_MODEL || "sonnet";
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--model",
      model,
      "--json-schema",
      JSON.stringify(EXTRACTION_SCHEMA),
      "--strict-mcp-config",
      "--allowedTools",
      `Read(/${filePath})`,
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

/** --output-format json wraps the reply in an envelope; the structured result
 * lives in `result` (a JSON string, occasionally already an object). */
function parseCliEnvelope(stdout: string): Extraction {
  let envelope: { result?: unknown; is_error?: boolean };
  try {
    envelope = JSON.parse(stdout) as typeof envelope;
  } catch {
    throw new Error("Claude CLI produced unparseable output.");
  }
  if (envelope.is_error) throw new Error("Claude CLI returned an error envelope.");
  if (typeof envelope.result === "string") {
    return toExtraction(JSON.parse(stripFences(envelope.result)));
  }
  return toExtraction(envelope.result);
}

async function extractWithCli(input: {
  b64: string;
  mime: string;
  fileName?: string;
}): Promise<Extraction> {
  const tmpPath = path.join(
    os.tmpdir(),
    `kb-extract-${randomBytes(8).toString("hex")}${extensionFor(input.mime, input.fileName)}`,
  );
  await fs.writeFile(tmpPath, Buffer.from(input.b64, "base64"));
  try {
    // Resolve symlinks (macOS /var → /private/var) so the path in the prompt
    // matches the path-scoped Read permission rule exactly.
    const realPath = await fs.realpath(tmpPath);
    const prompt =
      `Read the file at ${realPath}` +
      (input.fileName ? ` (original name: ${input.fileName})` : "") +
      `. ${EXTRACT_INSTRUCTIONS}`;
    return parseCliEnvelope(await invokeExtractCli(prompt, realPath));
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

// ── 2. data-api bridge ──────────────────────────────────────────────────────

async function extractViaDataApi(input: {
  b64: string;
  mime: string;
  fileName?: string;
}): Promise<Extraction> {
  const url = await getDataApiUrl();
  const res = await fetch(`${url}/extract_doc`, {
    method: "POST",
    headers: dataApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      mime: input.mime,
      data_b64: input.b64,
      file_name: input.fileName ?? null,
    }),
    signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`extraction bridge returned a non-JSON response (${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown> & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `extraction bridge error (${res.status})`);
  }
  return toExtraction(data);
}

// ── 3. Anthropic API ────────────────────────────────────────────────────────

async function extractWithAnthropic(
  apiKey: string,
  input: { b64: string; mime: string; fileName?: string },
): Promise<Extraction> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  let block: Record<string, unknown>;
  if (input.mime === "application/pdf") {
    block = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.b64 },
    };
  } else if (input.mime.startsWith("image/")) {
    block = {
      type: "image",
      source: { type: "base64", media_type: input.mime, data: input.b64 },
    };
  } else if (input.mime.startsWith("text/")) {
    block = {
      type: "text",
      text: Buffer.from(input.b64, "base64").toString("utf8").slice(0, 60_000),
    };
  } else {
    throw new Error(`Anthropic path cannot handle ${input.mime}`);
  }
  const prompt =
    `${EXTRACT_INSTRUCTIONS}\n\nReturn ONLY a JSON object: ` +
    `{"title": string, "text": string, "summary": string, "tags": string[], "suggested_artist": string|null}. No prose, no fences.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
    }),
    signal: AbortSignal.timeout(CLI_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Anthropic API error (${res.status})`);
  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
    stop_reason?: string;
  };
  if (data.stop_reason === "refusal") throw new Error("Anthropic API refused the request");
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  return toExtraction(JSON.parse(stripFences(text)));
}

// ── 4. Gemini ───────────────────────────────────────────────────────────────

async function extractWithGemini(
  apiKey: string,
  input: { b64: string; mime: string; fileName?: string },
): Promise<Extraction> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prompt =
    `${EXTRACT_INSTRUCTIONS}\n\nReturn a JSON object: ` +
    `{"title": string, "text": string, "summary": string, "tags": string[], "suggested_artist": string|null}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: input.mime, data: input.b64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 32768,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(CLI_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Gemini API error (${res.status})`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return toExtraction(JSON.parse(stripFences(text)));
}

// ── Chain ───────────────────────────────────────────────────────────────────

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function extractFromFile(input: {
  b64: string;
  mime: string;
  fileName?: string;
}): Promise<Extraction> {
  const errors: string[] = [];
  if (hasClaudeCli()) {
    try {
      return await extractWithCli(input);
    } catch (e) {
      errors.push(`cli: ${msg(e)}`);
    }
  }
  try {
    return await extractViaDataApi(input);
  } catch (e) {
    errors.push(`bridge: ${msg(e)}`);
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      return await extractWithAnthropic(anthropicKey, input);
    } catch (e) {
      errors.push(`anthropic: ${msg(e)}`);
    }
  }
  const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      return await extractWithGemini(geminiKey, input);
    } catch (e) {
      errors.push(`gemini: ${msg(e)}`);
    }
  }
  throw new Error(
    `Extraction failed: ${errors.join("; ") || "no extraction provider available"}`,
  );
}

// ── URL text extraction ─────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntities(s: string): string {
  const safeChar = (code: number) => {
    try {
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m: string, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

export async function extractTextFromUrl(
  url: string,
): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim()
    : "";

  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|nav|footer)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60_000);

  return { title, text };
}
