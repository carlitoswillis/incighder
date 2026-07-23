import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

// CSV export of artist metrics. Admin-only workflow tool.
//   /api/export              -> main (ungrouped) roster
//   /api/export?group=x      -> one group
//   /api/export?all=1        -> everything
//   /api/export?ids=a,b,c    -> a specific selection

const pool = getPool();

const COLUMNS: { header: string; pick: (a: RowDataPacket) => unknown }[] = [
  { header: "name", pick: (a) => a.name },
  { header: "group", pick: (a) => a.group_name },
  { header: "public", pick: (a) => (a.is_public ? "yes" : "no") },
  { header: "genres", pick: (a) => a.genres },
  { header: "spotify_followers", pick: (a) => a.followers },
  { header: "spotify_popularity", pick: (a) => a.popularity },
  { header: "spotify_monthly_listeners", pick: (a) => a.monthly_listeners },
  { header: "top_track", pick: (a) => a.top_track_name },
  { header: "top_track_plays", pick: (a) => a.top_track_plays },
  { header: "youtube_subscribers", pick: (a) => a.youtube_subscribers },
  { header: "youtube_total_views", pick: (a) => a.youtube_total_views },
  { header: "youtube_videos", pick: (a) => a.youtube_video_count },
  { header: "soundcloud_followers", pick: (a) => a.soundcloud_followers },
  { header: "soundcloud_tracks", pick: (a) => a.soundcloud_track_count },
  { header: "instagram_followers", pick: (a) => a.instagram_followers },
  { header: "instagram_posts", pick: (a) => a.instagram_posts },
  { header: "tiktok_followers", pick: (a) => a.tiktok_followers },
  { header: "tiktok_likes", pick: (a) => a.tiktok_likes },
  { header: "tiktok_videos", pick: (a) => a.tiktok_video_count },
  { header: "twitch_followers", pick: (a) => a.twitch_followers },
  { header: "x_followers", pick: (a) => a.x_followers },
  { header: "spotify_url", pick: (a) => a.external_urls?.spotify },
  { header: "instagram_url", pick: (a) => a.social_links?.instagram },
  { header: "tiktok_url", pick: (a) => a.social_links?.tiktok },
  { header: "youtube_url", pick: (a) => a.social_links?.youtube },
  { header: "soundcloud_url", pick: (a) => a.social_links?.soundcloud },
  { header: "bio", pick: (a) => a.bio },
];

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const group = params.get("group");
  const all = params.get("all") === "1";
  const ids = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const where: string[] = [];
  const values: unknown[] = [];
  let scope = "artists";
  if (ids.length) {
    where.push(`id IN (${ids.map(() => "?").join(",")})`);
    values.push(...ids);
    scope = "selection";
  } else if (group) {
    where.push("group_name = ?");
    values.push(group);
    scope = group;
  } else if (!all) {
    where.push("group_name IS NULL");
  } else {
    scope = "all";
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM artists${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY name`,
      values,
    );
    const lines = [
      COLUMNS.map((c) => c.header).join(","),
      ...rows.map((a) => COLUMNS.map((c) => cell(c.pick(a))).join(",")),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(lines.join("\n") + "\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="incighder-${scope}-${stamp}.csv"`,
      },
    });
  } catch (e) {
    console.error("Export failed:", e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
