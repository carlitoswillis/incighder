export interface ScrapeMetaEntry {
  last_scraped_at?: string;
  status?: "ok" | "error";
  error?: string | null;
}

export interface Artist {
  id: string;
  name: string;
  followers: number | null;
  popularity: number | null;
  genres: string | null;
  images: { url: string }[] | null;
  external_urls: { [key: string]: string } | null;
  monthly_listeners: number | null;
  spotify_id?: string | null;
  youtube_subscribers?: number | null;
  youtube_top_video_title?: string | null;
  youtube_top_video_views?: number | null;
  soundcloud_followers?: number | null;
  soundcloud_top_track?: string | null;
  soundcloud_top_track_plays?: number | null;
  instagram_followers?: number | null;
  tiktok_followers?: number | null;
  tiktok_likes?: number | null;
  x_followers?: number | null;
  social_links?: { [key: string]: string } | null;
  scrape_meta?: { [key: string]: ScrapeMetaEntry } | null;
}
