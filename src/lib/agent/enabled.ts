/**
 * GLO kill switch. Set NEXT_PUBLIC_GLO_ENABLED=false (or 0/off/no) to park the
 * assistant without removing it: the widget stops rendering and /api/agent*
 * answers 503. Nothing else in the stack is affected — the data-api, the
 * scrapers and /api/mcp keep running.
 *
 * One variable on purpose, so the client and the routes can never disagree.
 * NEXT_PUBLIC_ values are inlined at build time, so flipping it needs a dev
 * server restart locally and a redeploy on Vercel.
 */
export const GLO_ENABLED = !/^(false|0|off|no)$/i.test(
  (process.env.NEXT_PUBLIC_GLO_ENABLED ?? "").trim(),
);

/** 503 body for the agent routes while GLO is parked. */
export function gloDisabledResponse(): Response {
  return Response.json(
    { error: "GLO is turned off (NEXT_PUBLIC_GLO_ENABLED)." },
    { status: 503 },
  );
}
