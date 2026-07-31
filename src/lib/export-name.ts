"use client";

import { useEffect } from "react";

const SITE = "Incighder — Artist Traction Insights";

/**
 * Name the browser tab — and with it the exported file. Printing to PDF takes
 * the suggested filename from document.title, so a report that never sets one
 * exports as the site default no matter whose report it is.
 *
 * Restores the site default on unmount, matching the artist page.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    document.title = title;
    return () => {
      document.title = SITE;
    };
  }, [title]);
}

/**
 * The date part of an export's name: the single day it reads as of, or the
 * window when one is picked. ISO so the files sort chronologically.
 */
export function exportStamp(opts: {
  isFull: boolean;
  fromDay: string | null;
  toDay: string | null;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  if (opts.isFull || !opts.fromDay || !opts.toDay) return opts.toDay ?? today;
  return `${opts.fromDay} to ${opts.toDay}`;
}

/**
 * Assemble a report title. Leads with the subject so the exported file is
 * identifiable by name alone, and names the view so a compact and a detailed
 * export of the same roster don't collide in a downloads folder.
 */
export function reportTitle(subject: string, view: string, stamp: string): string {
  return `${subject} — ${view} — ${stamp} · Incighder`;
}
