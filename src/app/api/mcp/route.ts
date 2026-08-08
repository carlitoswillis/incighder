import { timingSafeEqual } from "crypto";
import { createMcpHandler } from "mcp-handler";
import { agentTools } from "@/lib/agent/tools";
import { jsonSchemaToZodObject } from "@/lib/mcp/schema";

// MCP (Model Context Protocol) endpoint: exposes the GLO tool registry to
// external agent clients (Claude Code, Claude Desktop via mcp-remote) over
// streamable HTTP. The connection is owner-only — a bearer MCP_TOKEN acts as
// an admin credential, so every tool runs with { admin: true }, including the
// mutating ones (save_fact, save_link, refresh_artist).

export const maxDuration = 120; // refresh_artist alone can take ~2 minutes

const handler = createMcpHandler((server) => {
  for (const tool of agentTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: jsonSchemaToZodObject(tool.inputSchema),
      },
      async (args) => {
        try {
          const result = await tool.run(
            (args ?? {}) as Record<string, unknown>,
            { admin: true },
          );
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
          };
        } catch (e) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: e instanceof Error ? e.message : String(e),
              },
            ],
          };
        }
      },
    );
  }
});

function authorized(request: Request): boolean {
  const token = process.env.MCP_TOKEN || "";
  if (!token) return false; // fail closed when MCP_TOKEN is unset
  const header = request.headers.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function guarded(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }
  return handler(request);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
