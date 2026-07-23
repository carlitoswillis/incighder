export interface ScrapeMetaEntry {
  last_scraped_at?: string;
  status?: "ok" | "error";
  error?: string | null;
}

export interface Artist {
  id: string;
  name: string;
  /** 1 = shown to non-admin visitors of the deployed site. */
  is_public?: number | null;
  bio?: string | null;
  /** 'lastfm' | 'manual' */
  bio_source?: string | null;
  followers: number | null;
  popularity: number | null;
  genres: string | null;
  images: { url: string }[] | null;
  external_urls: { [key: string]: string } | null;
  monthly_listeners: number | null;
  top_track_name?: string | null;
  top_track_plays?: number | null;
  spotify_id?: string | null;
  youtube_subscribers?: number | null;
  youtube_total_views?: number | null;
  youtube_video_count?: number | null;
  youtube_top_video_title?: string | null;
  youtube_top_video_views?: number | null;
  soundcloud_followers?: number | null;
  soundcloud_track_count?: number | null;
  soundcloud_top_track?: string | null;
  soundcloud_top_track_plays?: number | null;
  instagram_followers?: number | null;
  instagram_posts?: number | null;
  instagram_verified?: boolean | null;
  tiktok_followers?: number | null;
  tiktok_likes?: number | null;
  tiktok_video_count?: number | null;
  x_followers?: number | null;
  social_links?: { [key: string]: string } | null;
  scrape_meta?: { [key: string]: ScrapeMetaEntry } | null;
}
