"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Tiny markdown renderer for assistant messages: **bold**, `code`, - bullets,
// 1. numbered lists, [text](url) links, ### headings, paragraphs. Builds React
// nodes by parsing — never injects raw HTML.

const HEADING = /^#{1,4}\s+/;
const BULLET = /^\s*[-*]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;

// bold | inline code | markdown link
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  INLINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[1]}
        </strong>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-px font-mono text-[0.85em]"
        >
          {match[2]}
        </code>,
      );
    } else if (/^https?:\/\//.test(match[4])) {
      nodes.push(
        <a
          key={key++}
          href={match[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:opacity-80"
        >
          {match[3]}
        </a>,
      );
    } else {
      // Non-http(s) scheme — render as plain text rather than a link.
      nodes.push(match[0]);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isBlockStart(line: string): boolean {
  return HEADING.test(line) || BULLET.test(line) || ORDERED.test(line);
}

function renderBlocks(text: string): React.ReactNode[] {
  const lines = text.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (HEADING.test(line)) {
      out.push(
        <p
          key={key++}
          className="text-xs font-semibold tracking-wide text-foreground/90 uppercase"
        >
          {renderInline(line.replace(HEADING, "").trim())}
        </p>,
      );
      i++;
      continue;
    }

    if (BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(lines[i].replace(BULLET, "").trim());
        i++;
      }
      out.push(
        <ul key={key++} className="list-disc space-y-1 pl-5">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (ORDERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        items.push(lines[i].replace(ORDERED, "").trim());
        i++;
      }
      out.push(
        <ol key={key++} className="list-decimal space-y-1 pl-5">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph: consecutive plain lines up to a blank line or block start.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(<p key={key++}>{renderInline(para.join(" "))}</p>);
  }

  return out;
}

export function MarkdownLite({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-2 text-sm leading-relaxed tabular-nums break-words",
        className,
      )}
    >
      {renderBlocks(text)}
    </div>
  );
}
