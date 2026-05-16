'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { calculateArtistScore } from '../../../utils/score';

interface Artist {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string | null;
  images: any[] | null;
  external_urls: any | null;
  monthly_listeners: number | null;
}

export default function ArtistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.id as string;

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
  const [showEditForm, setShowEditForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchArtist = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/artists/${artistId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log("Artist fetched successfully:", data);
      setArtist(data);
      setFormData({
        name: data.name || '',
        followers: String(data.followers || ''),
        popularity: String(data.popularity || ''),
        genres: data.genres || '',
        images: Array.isArray(data.images) ? data.images.map((img: any) => img.url || img).join(', ') : '',
        external_urls: data.external_urls ? JSON.stringify(data.external_urls, null, 2) : '',
        monthly_listeners: String(data.monthly_listeners || '')
      });
    } catch (e: any) {
      console.error("Error fetching artist:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (artistId) {
      fetchArtist();
      console.log(artist);
    }
  }, [artistId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      let parsedUrls = null;
      if (formData.external_urls) {
        try {
          parsedUrls = JSON.parse(formData.external_urls);
        } catch (e) {
          // Attempt to merge comma-separated JSON objects
          const parts = formData.external_urls.split('},');
          parsedUrls = parts.reduce((acc, curr) => {
            const jsonString = curr.trim().endsWith('}') ? curr.trim() : curr.trim() + '}';
            return { ...acc, ...JSON.parse(jsonString) };
          }, {});
        }
      }

      const dataToSend = {
        ...formData,
        genres: formData.genres.split(',').map((s) => s.trim()).filter((s) => s),
        images: formData.images.split(',').map((s) => s.trim()).filter((s) => s).map(url => ({ url })),
        external_urls: parsedUrls,
      };

      if (dataToSend.external_urls && typeof dataToSend.external_urls !== 'object') {
        throw new Error("External URLs must be a valid JSON object.");
      }

      const response = await fetch(`/api/artists/${artistId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      setMessage('Artist data updated successfully!');
      console.log('Artist data updated successfully!');
      fetchArtist(); // Re-fetch to show updated data
    } catch (e: any) {
      console.error("Error updating artist:", e);
      setError(`Failed to update artist: ${e.message}`);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading artist details...</div>;
  }

  if (error) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: 'red' }}>Error: {error}</div>;
  }

  if (!artist) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>Artist not found.</div>;
  }

  let parsedGenres: string[] = [];
  try {
    parsedGenres = artist.genres ? artist.genres.split(',') : [];
  } catch (e) {
    console.error("Error parsing genres:", artist.genres, e);
  }

  const displayImage = artist.images && artist.images.length > 0 ? artist.images[0].url : null;
  const spotifyUrl = artist.external_urls ? artist.external_urls.spotify : null;

  const { score, breakdown } = calculateArtistScore(artist);

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '2em', marginBottom: '20px', textAlign: 'center' }}>{artist.name}</h1>
      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', maxWidth: '600px', margin: '0 auto', backgroundColor: '#fff' }}>
        {displayImage && (
          <img
            src={displayImage}
            alt={artist.name}
            style={{ width: '120px', height: '120px', borderRadius: '50%', display: 'block', margin: '0 auto 15px' }}
          />
        )}
        <p><strong>ID:</strong> {artist.id}</p>
        <p><strong>Score:</strong> {score}</p>
        <pre style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '5px', fontSize: '0.9em', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{breakdown}</pre>
        <p><strong>Followers:</strong> {artist.followers !== null ? artist.followers.toLocaleString() : 'N/A'}</p>
        <p><strong>Popularity:</strong> {artist.popularity !== null ? artist.popularity : 'N/A'}</p>
        <p><strong>Genres:</strong> {parsedGenres.length > 0 ? parsedGenres.join(', ') : 'N/A'}</p>
        {artist.monthly_listeners !== null && (
          <p><strong>Monthly Listeners:</strong> {artist.monthly_listeners.toLocaleString()}</p>
        )}
        
        {artist.external_urls && Object.keys(artist.external_urls).length > 0 && (
          <div style={{ marginBottom: '15px' }}>
            <strong>External URLs:</strong>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {Object.entries(artist.external_urls).map(([site, url]: [string, any]) => (
                <li key={site} style={{ marginBottom: '5px' }}>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ textTransform: 'capitalize' }}>
                    {site}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
          <button
            onClick={() => setShowEditForm(!showEditForm)}
            style={{ backgroundColor: '#6c757d', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '10px' }}
          >
            {showEditForm ? 'Hide Edit Form' : 'Edit Data'}
          </button>
          
          {showEditForm && (
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="name" style={{ display: 'block', marginBottom: '5px' }}>
                  Name:
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  placeholder="Enter artist name"
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="followers" style={{ display: 'block', marginBottom: '5px' }}>
                  Followers:
                </label>
                <input
                  type="number"
                  id="followers"
                  name="followers"
                  value={formData.followers}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  placeholder="Enter followers count"
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="popularity" style={{ display: 'block', marginBottom: '5px' }}>
                  Popularity:
                </label>
                <input
                  type="number"
                  id="popularity"
                  name="popularity"
                  value={formData.popularity}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  placeholder="Enter popularity score"
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="genres" style={{ display: 'block', marginBottom: '5px' }}>
                  Genres (Comma-separated list):
                </label>
                <input
                  id="genres"
                  name="genres"
                  value={formData.genres}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  placeholder='e.g. rock, jazz'
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="images" style={{ display: 'block', marginBottom: '5px' }}>
                  Images (Comma-separated list):
                </label>
                <textarea
                  id="images"
                  name="images"
                  value={formData.images}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  placeholder='e.g. url1, url2'
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="external_urls" style={{ display: 'block', marginBottom: '5px' }}>
                  External URLs (Valid JSON object):
                </label>
                <textarea
                  id="external_urls"
                  name="external_urls"
                  value={formData.external_urls}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  placeholder='e.g. {"spotify": "https://spotify.com/..."}'
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="monthly_listeners" style={{ display: 'block', marginBottom: '5px' }}>
                  Monthly Listeners:
                </label>
                <input
                  type="number"
                  id="monthly_listeners"
                  name="monthly_listeners"
                  value={formData.monthly_listeners}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  placeholder="Enter monthly listeners count"
                />
              </div>
              <button
                type="submit"
                style={{ backgroundColor: '#007bff', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Save Changes
              </button>
            </form>
          )}
          {message && <p style={{ color: 'green', marginTop: '10px' }}>{message}</p>}
          {error && <p style={{ color: 'red', marginTop: '10px' }}>Error: {error}</p>}
        </div>
      </div>
    </div>
  );
}
