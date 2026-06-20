'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { calculateArtistScore } from '../../../utils/score';

interface Image {
  url: string;
}

interface ExternalUrls {
  [key: string]: string;
}

interface ScrapeMetaEntry {
  last_scraped_at?: string;
  status?: string;
  error?: string | null;
}

interface Artist {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string | null;
  images: Image[] | null;
  external_urls: ExternalUrls | null;
  monthly_listeners: number | null;
  spotify_id?: string | null;
  youtube_subscribers?: number | null;
  youtube_top_video_title?: string | null;
  youtube_top_video_views?: number | null;
  soundcloud_followers?: number | null;
  soundcloud_top_track?: string | null;
  soundcloud_top_track_plays?: number | null;
  social_links?: { [key: string]: string } | null;
  scrape_meta?: { [key: string]: ScrapeMetaEntry } | null;
}

function ArtistDetailComponent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const artistId = params.id as string;
  const editMode = searchParams.get('edit') === 'true';

  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    followers: '',
    popularity: '',
    genres: '',
    images: '',
    external_urls: '',
    monthly_listeners: ''
  });
  const [showEditForm, setShowEditForm] = useState(editMode);
  const [message, setMessage] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState({ spotify: '', youtube: '', soundcloud: '' });
  const [scraping, setScraping] = useState(false);
  const [forceScrape, setForceScrape] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<{ [key: string]: { ok: boolean; error?: string | null; skipped?: string } } | null>(null);

  useEffect(() => {
    setShowEditForm(editMode);
  }, [editMode]);

  useEffect(() => {
    async function loadArtist() {
      if (!artistId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/artists/${artistId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setArtist(data);
        const links = data.social_links || {};
        setSocialLinks({
          spotify: links.spotify || data.external_urls?.spotify || (data.spotify_id ? `https://open.spotify.com/artist/${data.spotify_id}` : ''),
          youtube: links.youtube || '',
          soundcloud: links.soundcloud || '',
        });
        setFormData({
          name: data.name || '',
          followers: String(data.followers || ''),
          popularity: String(data.popularity || ''),
          genres: data.genres || '',
          images: Array.isArray(data.images) ? data.images.map((img: Image | string) => (typeof img === 'string' ? img : img.url)).join(', ') : '',
          external_urls: data.external_urls ? JSON.stringify(data.external_urls, null, 2) : '',
          monthly_listeners: String(data.monthly_listeners || '')
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    loadArtist();
  }, [artistId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    let parsedUrls = null;
    if (formData.external_urls) {
      try {
        parsedUrls = JSON.parse(formData.external_urls);
      } catch {
        try {
          const fixedJson = formData.external_urls
            .replace(/(\w+):/g, '"$1":')
            .replace(/'/g, '"');
          parsedUrls = JSON.parse(fixedJson);
        } catch {
          setError('External URLs must be a valid JSON object.');
          return;
        }
      }
    }

    try {
      const dataToSend = {
        ...formData,
        genres: formData.genres.split(',').map((s) => s.trim()).filter((s) => s),
        images: formData.images.split(',').map((s) => s.trim()).filter((s) => s).map(url => ({ url })),
        external_urls: parsedUrls,
      };

      const response = await fetch(`/api/artists/${artistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update artist');
      }

      setMessage('Artist data updated successfully!');
      const updatedResponse = await fetch(`/api/artists/${artistId}`);
      const data = await updatedResponse.json();
      setArtist(data);
    } catch (e: unknown) {
      setError(`Failed to update artist: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleScrape = async () => {
    setScraping(true);
    setScrapeStatus(null);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: artistId, links: socialLinks, force: forceScrape }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Scrape failed');
      setArtist(result.artist);
      const statuses: { [key: string]: { ok: boolean; error?: string | null; skipped?: string } } = {};
      for (const [platform, r] of Object.entries(result.results || {})) {
        const res = r as { ok: boolean; error?: string | null; skipped?: string };
        statuses[platform] = { ok: res.ok, error: res.error, skipped: res.skipped };
      }
      setScrapeStatus(statuses);
      setMessage('Scrape complete.');
    } catch (e: unknown) {
      setError(`Scrape failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScraping(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
  if (!artist) return <div>Artist not found.</div>;

  let parsedGenres: string[] = [];
  try {
    parsedGenres = artist.genres ? artist.genres.split(',') : [];
  } catch (e) { }

  const { score, breakdown } = calculateArtistScore(artist);

  return (
    <div>
      <h1 style={{ fontSize: '2em', marginBottom: '20px', textAlign: 'center' }}>{artist.name}</h1>
      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', maxWidth: '600px', margin: '0 auto', backgroundColor: '#fff' }}>
        {artist.images && artist.images.length > 0 && (
          <Image src={artist.images[0].url} alt={artist.name} width={120} height={120} style={{ borderRadius: '50%', display: 'block', margin: '0 auto 15px' }} />
        )}
...        <p><strong>ID:</strong> {artist.id}</p>
        <p><strong>Score:</strong> {score}</p>
        <pre style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '5px', fontSize: '0.9em', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{breakdown}</pre>
        <p><strong>Genres:</strong> {parsedGenres.length > 0 ? parsedGenres.join(', ') : 'N/A'}</p>

        <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
          <h3 style={{ marginBottom: '8px' }}>Cross-Platform Metrics</h3>
          <p><strong>Spotify monthly listeners:</strong> {artist.monthly_listeners != null ? artist.monthly_listeners.toLocaleString() : 'N/A'}</p>
          <p><strong>YouTube subscribers:</strong> {artist.youtube_subscribers != null ? artist.youtube_subscribers.toLocaleString() : 'N/A'}{artist.youtube_top_video_title ? ` — top: "${artist.youtube_top_video_title}" (${(artist.youtube_top_video_views ?? 0).toLocaleString()} views)` : ''}</p>
          <p><strong>SoundCloud followers:</strong> {artist.soundcloud_followers != null ? artist.soundcloud_followers.toLocaleString() : 'N/A'}{artist.soundcloud_top_track ? ` — top: "${artist.soundcloud_top_track}" (${(artist.soundcloud_top_track_plays ?? 0).toLocaleString()} plays)` : ''}</p>
        </div>

        <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
          <h3 style={{ marginBottom: '8px' }}>Sources &amp; Scraping</h3>
          {(['spotify', 'youtube', 'soundcloud'] as const).map((platform) => {
            const status = scrapeStatus?.[platform];
            const meta = artist.scrape_meta?.[platform];
            return (
              <div key={platform} style={{ marginBottom: '8px' }}>
                <label style={{ display: 'inline-block', width: '90px', textTransform: 'capitalize' }}>{platform}</label>
                <input
                  value={socialLinks[platform]}
                  onChange={(e) => setSocialLinks({ ...socialLinks, [platform]: e.target.value })}
                  placeholder={`${platform} profile URL`}
                  style={{ width: '60%' }}
                />
                {status && (
                  <span style={{ marginLeft: '8px', color: status.ok ? 'green' : 'red' }}>
                    {status.skipped ? 'cached' : status.ok ? '✓' : `✗ ${status.error || ''}`}
                  </span>
                )}
                {meta?.last_scraped_at ? (
                  <div style={{ fontSize: '0.8em', color: '#888' }}>updated {new Date(meta.last_scraped_at).toLocaleString()}</div>
                ) : null}
              </div>
            );
          })}
          <label style={{ fontSize: '0.9em', display: 'block', marginBottom: '8px' }}>
            <input type="checkbox" checked={forceScrape} onChange={(e) => setForceScrape(e.target.checked)} /> force refresh (ignore 24h cache)
          </label>
          <button onClick={handleScrape} disabled={scraping} style={{ backgroundColor: '#17a2b8', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: scraping ? 'not-allowed' : 'pointer' }}>
            {scraping ? 'Scraping…' : 'Scrape now'}
          </button>
        </div>

        <button onClick={() => setShowEditForm(!showEditForm)} style={{ backgroundColor: '#6c757d', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '10px' }}>
          {showEditForm ? 'Hide Edit Form' : 'Edit Data'}
        </button>
        {showEditForm && (
          <form onSubmit={handleSave}>
            <input name="name" value={formData.name} onChange={handleChange} placeholder="Name" style={{ width: '100%', marginBottom: '10px' }} />
            <input name="genres" value={formData.genres} onChange={handleChange} placeholder="Genres (comma separated)" style={{ width: '100%', marginBottom: '10px' }} />
            <textarea name="images" value={formData.images} onChange={handleChange} placeholder="Images (comma separated URLs)" style={{ width: '100%', marginBottom: '10px' }} />
            <textarea name="external_urls" value={formData.external_urls} onChange={handleChange} placeholder="External URLs (JSON object)" style={{ width: '100%', marginBottom: '10px' }} />
            <button type="submit" style={{ backgroundColor: '#007bff', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save Changes</button>
          </form>
        )}
        {message && <p style={{ color: 'green' }}>{message}</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      </div>
    </div>
  );
}

export default function ArtistDetailPage() {
  return <Suspense fallback={<div>Loading...</div>}><ArtistDetailComponent /></Suspense>;
}
