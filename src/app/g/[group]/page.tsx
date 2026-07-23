"use client";

import { use } from "react";
import { ArtistGrid } from "@/components/artist-grid";

// Roster-separated view: /g/glogang shows only artists whose group_name is
// "glogang" (they're excluded from the main list). Public URL — visitors see
// the group's public members.
export default function GroupPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group } = use(params);
  const name = decodeURIComponent(group);
  return <ArtistGrid title={name} group={name} />;
}
