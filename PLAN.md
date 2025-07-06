Comprehensive Data Integration Plan for Artist Assessment (Revised)

  Overall Goal: To build a data application that provides a holistic view
  of an artist's online traction and potential, incorporating a wide array
   of metrics from various digital platforms for A&R assessment, with a
  continuously updated and reflective user interface.

  1. Core Metrics to Integrate (User's Requirements)

  Here's a structured list of the metrics we aim to integrate, categorized
   for clarity:

  A. Artist Identity & Basic Presence:
   * Artist Name
   * Instagram Handle
   * TikTok Handle
   * X/Twitter Handle


  B. Follower & Subscriber Counts:
   * Instagram Follower Count
   * TikTok Follower Count
   * X/Twitter Follower Count
   * Spotify Monthly Listeners (Note: Proprietary, manual input/proxy
     needed)
   * SoundCloud Follower Count
   * YouTube Subscriber Count


  C. Top Content & Performance:
   * Top Spotify Song
   * Spotify Top Song Plays (Note: Public API provides popularity, not
     exact plays)
   * Top SoundCloud Song
   * SoundCloud Top Song Plays
   * Top YouTube Song
   * YouTube Top Song Plays (Video Views)


  D. Engagement & Growth Metrics:
   * Instagram Engagement Rate (Likes + Comments ÷ Followers)
   * TikTok Engagement Rate (Likes, Shares, Comments per video)
   * TikTok Average Views Per Video
   * TikTok Virality Score (Number of viral videos)
   * TikTok Sounds Usage (How many people are using their original sounds)
   * YouTube Engagement Rate (Likes, Comments, Watch Time per video)
   * YouTube Average Views Per Video
   * YouTube Shorts Performance (Views, Likes, Shares)
   * X/Twitter Engagement Rate (Likes, Retweets, Comments per tweet)
   * Follower Growth Rate (Across all platforms)
   * Cross-Platform Presence (How well they perform across multiple
     platforms)


  E. Streaming & Revenue Indicators:
   * Spotify Monthly Listeners Growth Rate (Note: Proprietary, manual
     input/proxy needed)
   * Spotify Playlist Placements (Editorial, Algorithmic, User-Generated)
     (Note: Challenging via public API)
   * Spotify Skip Rate (Note: Not available via public API)
   * Spotify Save Rate (Note: Not available via public API)
   * Spotify Algorithmic Reach (e.g., Discover Weekly, Release Radar
     placements) (Note: Not available via public API)
   * SoundCloud Reposts & Comments Per Song
   * Apple Music & Amazon Music Streams (Note: Challenging via public API)
   * Bandcamp Sales & Supporters (Note: Requires Bandcamp API or scraping)
   * Merch Sales Data (Note: Highly proprietary, manual input likely)
   * Live Performance Ticket Sales (Note: Highly proprietary, manual input
      likely)

  F. Fanbase & Community:
   * Number of Active Superfans (Note: Qualitative/complex analysis)
   * Discord or Fan Club Membership (Note: Manual input/specific
     integrations)
   * Patreon or Subscription-Based Supporters (Note: Manual input/specific
      integrations)


  G. Industry & Media Recognition:
   * Press Coverage (Articles, Blogs, Features) (Note: Requires news/media
      APIs or manual tracking)
   * Influencer & Celebrity Co-signs (Shoutouts, Features, Endorsements)
     (Note: Qualitative/complex analysis)
   * Brand Collaborations & Sponsorships (Note: Qualitative/manual
     tracking)


  H. Music Quality & Longevity:
   * Catalog Size (Number of released songs/albums)
   * Release Consistency (How often they drop new music)
   * Music Video Production Quality (Note: Qualitative)
   * Lyric & Melody Analysis (AI-based tools or expert opinion on
     potential hits) (Note: Advanced, out of scope for initial data
     collection)

  ---

  2. Current Status


   * Spotify Basic Data: We currently fetch and store:
       * Artist Name
       * Spotify ID
       * Follower Count (Spotify)
       * Popularity (Spotify)
       * Genres
       * Images
       * External URLs
   * Spotify Top Track Data: We have successfully integrated:
       * Top Spotify Song (Name)
       * Spotify Top Song Popularity (as a proxy for "Spotify Top Song
         Plays")
       * Top Spotify Song ID
   * Database Schema: Updated to accommodate the new Spotify top track
     data.
   * Data Ingestion: The data-api is set up to receive and store this
     information.


  3. Challenges & Limitations

  It's crucial to acknowledge that not all desired metrics are readily
  available via public APIs. Some are proprietary, require special
  access, or are qualitative in nature.


   * Proprietary Data: "Spotify Monthly Listeners," "Spotify Skip Rate,"
     "Spotify Save Rate," and "Spotify Algorithmic Reach" are generally
     not accessible through the public Spotify API. These often require
     direct partnerships or access to artist-specific dashboards.
   * API Restrictions: Social media APIs (Instagram, TikTok, X/Twitter)
     often have strict rate limits, require developer approval, or have
     limited public data access, especially for engagement metrics.
   * Qualitative Data: Metrics like "Number of Active Superfans," "Press
     Coverage," "Influencer Co-signs," and "Music Video Production
     Quality" are inherently qualitative or require advanced NLP/AI for
     automated extraction, which is beyond the scope of initial data
     collection.
   * Web Scraping: While an option for some data, web scraping is fragile,
      can violate terms of service, and is generally a last resort due to
     maintenance overhead.

  4. Phased Integration Plan


  We will proceed in phases, prioritizing platforms with accessible
  public APIs and then addressing more challenging metrics. For each
  phase, we will ensure the frontend is updated to display the new data.

  Phase 1: YouTube Integration (Next Step)

  Goal: Integrate YouTube Subscriber Count, Top YouTube Song, and
  YouTube Top Song Plays (Video Views).


  Prerequisites:
   * YouTube Data API Key: You must obtain this from the Google Cloud
     Console and enable the "YouTube Data API v3." Add it to your .env
     file as YOUTUBE_API_KEY=your_youtube_api_key.

  Technical Steps (Backend):


   1. Rename `data-api/spotify_search.py` to
      `data-api/fetch_artist_data.py`: This script will become the central
      point for fetching data from various platforms for a given artist.
       * Action: Rename the file.
       * Action: Update data-api/app.py to call fetch_artist_data.py
         instead of spotify_search.py.
   2. Modify `data-api/fetch_artist_data.py`:
       * Add googleapiclient.discovery to requirements.txt.
       * Initialize the YouTube API client using the YOUTUBE_API_KEY.
       * Implement a function to search for an artist's official YouTube
         channel using their name.
       * If a channel is found, fetch its subscriber count.
       * Identify and fetch details for the artist's most popular video (as
         a proxy for "Top YouTube Song" and "YouTube Top Song Plays").
       * Integrate this YouTube data into the existing artist data
         structure before returning it.
   3. Update `data-api/schema.sql`:
       * Add new columns to the artists table:
           * youtube_channel_id (VARCHAR)
           * youtube_subscriber_count (INTEGER)
           * youtube_top_song_id (VARCHAR)
           * youtube_top_song_name (VARCHAR)
           * youtube_top_song_views (INTEGER)
   4. Modify `data-api/scrapeArtistData.py`:
       * Update the INSERT and ON CONFLICT DO UPDATE statements to include
         the new YouTube-related columns.
       * Ensure the script correctly extracts and inserts the YouTube data
         from the artist_json_data passed to it.

  Technical Steps (Frontend - Next.js):


   1. Update API Calls: Ensure the frontend's API calls to /api/artists and
       /api/spotify-search (which will now internally call
      fetch_artist_data.py) are updated to expect and handle the new
      YouTube data fields.
   2. Modify Homepage (`/`): Update the artist card component to display
      relevant YouTube data (e.g., subscriber count, top song).
   3. Modify Table View (`/table`): Add new columns to the table to display
       YouTube channel ID, subscriber count, top song name, and views.
   4. Modify Artist Detail Page (`/artists/[id]`): Enhance this page to
      prominently display all new YouTube-related information for the
      specific artist.


  Verification:
   * After implementing, rebuild the data-api Docker image and re-apply
     the schema.
   * Restart the Next.js development server.
   * Test the "add artist" functionality in the application.
   * Verify that YouTube channel ID, subscriber count, top song name, and
     views are correctly stored in the database for new artists.
   * Crucially, verify that the new YouTube data is displayed correctly on
      the homepage, table view, and artist detail pages.

  Phase 2: SoundCloud Integration

  Goal: Integrate SoundCloud Follower Count, Total SoundCloud Plays, Top
  SoundCloud Song, SoundCloud Top Song Plays, and Reposts & Comments Per
  Song.


  Prerequisites:
   * SoundCloud API: Investigate the current state of the SoundCloud API
     for public data access. It may require developer registration.


  Technical Steps (Backend):
   1. Modify `data-api/fetch_artist_data.py`:
       * Add SoundCloud API client (if available).
       * Implement logic to search for an artist's SoundCloud profile.
       * Fetch follower count, total plays, and details of their top track
          (name, plays, reposts, comments).
       * Integrate this data into the artist data structure.
   2. Update `data-api/schema.sql`:
       * Add new columns to the artists table for SoundCloud data.
   3. Modify `data-api/scrapeArtistData.py`:
       * Update INSERT and ON CONFLICT DO UPDATE statements.


  Technical Steps (Frontend - Next.js):
   1. Update API Calls: Ensure frontend API calls are updated to handle new
       SoundCloud data.
   2. Modify Homepage (`/`): Update artist cards to display relevant
      SoundCloud data.
   3. Modify Table View (`/table`): Add new columns to the table for
      SoundCloud data.
   4. Modify Artist Detail Page (`/artists/[id]`): Enhance this page to
      display all new SoundCloud-related information.


  Verification:
   * Rebuild data-api and re-apply schema.
   * Restart Next.js development server.
   * Test adding artists and verify SoundCloud data in the database and on
      the frontend UI.

  Phase 3: Social Media Handles & Follower Counts (Instagram, TikTok,
  X/Twitter)

  Goal: Integrate Instagram Handle, TikTok Handle, X/Twitter Handle, and
  their respective Follower Counts.


  Prerequisites:
   * API Access: Research the current public API access for Instagram,
     TikTok, and X/Twitter. These platforms frequently change their API
     policies, often restricting access to follower counts for
     non-business accounts or requiring significant developer approval.
   * Alternative (if APIs are too restrictive): Consider manual input for
     handles and follower counts, or explore third-party data providers if
      the budget allows.


  Technical Steps (Backend - Conditional on API Access):
   1. Modify `data-api/fetch_artist_data.py`:
       * Implement API calls for each platform to find artist profiles and
          fetch follower counts.
       * Integrate handles and follower counts into the artist data
         structure.
   2. Update `data-api/schema.sql`:
       * Add columns for handles and follower counts.
   3. Modify `data-api/scrapeArtistData.py`:
       * Update INSERT and ON CONFLICT DO UPDATE statements.


  Technical Steps (Frontend - Next.js):
   1. Update API Calls: Ensure frontend API calls are updated to handle new
       social media data.
   2. Modify Homepage (`/`): Update artist cards to display relevant social
       media handles and follower counts.
   3. Modify Table View (`/table`): Add new columns to the table for social
       media data.
   4. Modify Artist Detail Page (`/artists/[id]`): Enhance this page to
      display all new social media-related information.


  Verification:
   * Rebuild data-api and re-apply schema.
   * Restart Next.js development server.
   * Test and verify data in the database and on the frontend UI.

  Phase 4: Engagement Rates & Advanced Streaming Metrics


  Goal: Address engagement rates (Instagram, TikTok, YouTube, X/Twitter),
  Spotify playlist placements, skip/save rates, algorithmic reach, and
  growth rates.

  Challenges:
   * As noted, many of these are not publicly available via direct APIs.
   * Calculating engagement rates often requires access to post-level data
      (likes, comments, shares per post), which is heavily restricted.


  Approach:
   * Discussion Point: For these metrics, we will need to discuss the
     feasibility. Options include:
       * Manual Input: For critical metrics not available via API.
       * Third-Party Analytics Services: Explore if there are external
         services that provide this data and have APIs we can integrate
         (may involve cost).
       * Simplified Proxies: For example, for "Follower Growth Rate," we
         could implement historical tracking within our own database by
         periodically fetching follower counts and calculating the growth.
       * Scope Adjustment: Re-evaluate which of these are absolutely
         critical for the MVP and which can be deferred.


  Technical Steps (Backend & Frontend - Conditional on Approach):
   * If manual input: Update schema for new fields, update
     scrapeArtistData.py to handle manual input, and update frontend
     forms/display.
   * If third-party API: Integrate new API calls into
     fetch_artist_data.py, update schema, update scrapeArtistData.py, and
     update frontend.

  Phase 5: Other Platforms & Qualitative Data

  Goal: Integrate Apple Music & Amazon Music Streams, Bandcamp Sales,
  Merch Sales, Live Performance, Fanbase, Industry Recognition, and Music
  Quality.


  Challenges:
   * Highly proprietary data.
   * Many are qualitative and require manual input or advanced data
     analysis/AI.


  Approach:
   * Manual Input: For most of these, manual input will likely be the
     primary method. We can add fields to the database and UI for users to
      manually enter this information.
   * Specific Integrations: If a specific platform (e.g., Bandcamp) has an
      accessible API for sales data, we can integrate it.


  Technical Steps (Backend & Frontend - Conditional on Approach):
   * Similar to Phase 4, depending on whether manual input or API
     integration is chosen.

  ---

  5. General Development Workflow (Revised to include Frontend)

  For each phase, the general workflow will be:


   1. API Key Acquisition (if needed): User obtains necessary API keys.
   2. Backend Code Modification:
       * Update data-api/fetch_artist_data.py to fetch new data.
       * Update data-api/schema.sql to add new columns.
       * Update data-api/scrapeArtistData.py to handle new data insertion.
   3. Docker Rebuild & Schema Application:
       * docker-compose down (to stop all services)
       * docker-compose up --build -d db data-api (to rebuild data-api and
          restart services)
       * docker-compose run --rm data-api python apply_schema.py (to apply
          schema changes)
   4. Frontend Code Modification (Next.js):
       * Update API calls to expect and handle new data fields.
       * Modify relevant components (e.g., homepage cards, table view,
         artist detail pages) to display the new data.
   5. Restart Next.js Development Server:
       * docker-compose up -d incighder-dev
   6. Testing & Verification:
       * Manually test the "add artist" functionality in the UI.
       * Verify that new data is correctly stored in the database.
       * Crucially, verify that the new data is displayed correctly on the
          homepage, table view, and artist detail pages.
   7. Iteration: Review results, debug any issues, and refine the
      implementation.