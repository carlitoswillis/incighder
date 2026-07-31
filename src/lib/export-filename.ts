// Naming for downloaded files. Kept apart from the route so it can be read and
// tested on its own — a filename is the only label an export carries once it
// has left the app.

/**
 * Filename-safe slug: "Wildcard Collective" -> "wildcard-collective". A raw
 * group name in a filename brings its spaces and punctuation with it, and a
 * non-ASCII one cannot go into a Content-Disposition filename at all.
 */
export function slug(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip accents rather than drop the letter
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "export"
  );
}

/** What an export is OF. Leads the filename, so it must identify it alone. */
export function exportScope(opts: {
  ids?: string[];
  group?: string | null;
  all?: boolean;
}): string {
  if (opts.ids?.length) return `selection-${opts.ids.length}`;
  if (opts.group) return slug(opts.group);
  // "main-roster", not "roster": a group actually named "roster" would
  // otherwise export to the same filename as the ungrouped list.
  return opts.all ? "all-artists" : "main-roster";
}

export function csvFilename(
  scope: string,
  today: Date = new Date(),
): string {
  return `incighder-${scope}-${today.toISOString().slice(0, 10)}.csv`;
}

/**
 * Content-Disposition carrying both forms: the plain one for older clients,
 * filename* (RFC 5987) for anything that has to survive a non-ASCII name.
 */
export function attachmentHeader(filename: string): string {
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
