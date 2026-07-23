import type { IconType } from "react-icons";
import {
  SiSpotify,
  SiYoutube,
  SiSoundcloud,
  SiInstagram,
  SiTiktok,
  SiTwitch,
  SiX,
} from "react-icons/si";
import type { Artist } from "./types";

export type PlatformKey =
  | "spotify"
  | "youtube"
  | "soundcloud"
  | "instagram"
  | "tiktok"
  | "twitch"
  | "x";

export interface PlatformMeta {
  key: PlatformKey;
  label: string;
  color: string; // brand hex (icon tint)
  Icon: IconType;
  scraped: boolean; // x is manual-only
  linkField?: PlatformKey; // key in artist.social_links (scraped platforms)
  metric: { field: keyof Artist; label: string }; // primary count column
  extra?: { field: keyof Artist; label: string }; // e.g. tiktok likes
  sub?: {
    titleField: keyof Artist;
    valueField: keyof Artist;
    valueLabel: string;
  }; // top track/video
}

export const PLATFORMS: PlatformMeta[] = [
  {
    key: "spotify",
    label: "Spotify",
    color: "#1DB954",
    Icon: SiSpotify,
    scraped: true,
    linkField: "spotify",
    metric: { field: "monthly_listeners", label: "Monthly listeners" },
    sub: {
      titleField: "top_track_name",
      valueField: "top_track_plays",
      valueLabel: "plays",
    },
  },
  {
    key: "youtube",
    label: "YouTube",
    color: "#FF0000",
    Icon: SiYoutube,
    scraped: true,
    linkField: "youtube",
    metric: { field: "youtube_subscribers", label: "Subscribers" },
    extra: { field: "youtube_video_count", label: "videos" },
    sub: {
      titleField: "youtube_top_video_title",
      valueField: "youtube_top_video_views",
      valueLabel: "views",
    },
  },
  {
    key: "soundcloud",
    label: "SoundCloud",
    color: "#FF5500",
    Icon: SiSoundcloud,
    scraped: true,
    linkField: "soundcloud",
    metric: { field: "soundcloud_followers", label: "Followers" },
    extra: { field: "soundcloud_track_count", label: "tracks" },
    sub: {
      titleField: "soundcloud_top_track",
      valueField: "soundcloud_top_track_plays",
      valueLabel: "plays",
    },
  },
  {
    key: "instagram",
    label: "Instagram",
    color: "#E1306C",
    Icon: SiInstagram,
    scraped: true,
    linkField: "instagram",
    metric: { field: "instagram_followers", label: "Followers" },
    extra: { field: "instagram_posts", label: "posts" },
  },
  {
    key: "tiktok",
    label: "TikTok",
    color: "#FE2C55",
    Icon: SiTiktok,
    scraped: true,
    linkField: "tiktok",
    metric: { field: "tiktok_followers", label: "Followers" },
    extra: { field: "tiktok_likes", label: "likes" },
  },
  {
    key: "twitch",
    label: "Twitch",
    color: "#9146FF",
    Icon: SiTwitch,
    scraped: true,
    linkField: "twitch",
    metric: { field: "twitch_followers", label: "Followers" },
  },
  {
    key: "x",
    label: "X",
    color: "#E7E9EA",
    Icon: SiX,
    scraped: false,
    metric: { field: "x_followers", label: "Followers (manual)" },
  },
];

/** Scraped platforms only — the SourcesPanel iterates these. */
export const SCRAPED_PLATFORMS = PLATFORMS.filter((p) => p.scraped);
