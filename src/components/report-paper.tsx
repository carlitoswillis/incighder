"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// One sheet of paper — a fixed box, on screen and on the printer, so what you
// see is what prints. Content is laid out to fit it as-is (never scaled down);
// a roster too long for one sheet gets split across several ReportPapers, which
// print as separate pages.
//
// On screen the whole sheet is scaled down when the viewport is narrower than
// the paper, so it stays a readable whole page on a phone. That's a transform,
// which never touches layout size, and it's dropped for print.

// 96 CSS px per inch. Sized to fit inside the printable area of BOTH US Letter
// (7.5 x 10in) and A4 (7.27 x 10.69in) at the 0.5in @page margin in globals.css.
const PAGE_W = 696; // 7.25in
const PAGE_H = 936; // 9.75in

export function ReportPaper({ children }: { children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState(1);

  useEffect(() => {
    const measure = () => {
      const box = shell.current;
      if (box) setPreview(Math.min(1, box.clientWidth / PAGE_W));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (shell.current) ro.observe(shell.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={shell}
      className="report-shell"
      style={{ "--preview-h": `${PAGE_H * preview}px` } as CSSProperties}
    >
      <div
        className="report-page mx-auto overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
        style={
          {
            "--preview": preview,
            width: `${PAGE_W}px`,
            height: `${PAGE_H}px`,
          } as CSSProperties
        }
      >
        <div className="flex h-full flex-col p-8">{children}</div>
      </div>
    </div>
  );
}

/** Members per roster sheet — what fits without crowding the page. */
export const ROSTER_PAGE_SIZE = 12;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
