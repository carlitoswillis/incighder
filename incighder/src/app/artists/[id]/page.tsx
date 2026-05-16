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
        followers: String(data.followers) || '',
        popularity: String(data.popularity) || '',
        genres: JSON.stringify(data.genres) || '',
        images: JSON.stringify(data.images) || '',
        external_urls: JSON.stringify(data.external_urls) || '',
        monthly_listeners: String(data.monthly_listeners) || ''
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
    }
  }, [artistId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSave = async () => {
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/artists/${artistId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
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
    parsedGenres = artist.genres ? JSON.parse(artist.genres) : [];
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
        {spotifyUrl && (
          <p>
            <a
              href={spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Spotify
            </a>
          </p>
        )}

        <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
          <h2 style={{ fontSize: '1.5em', marginBottom: '10px' }}>Edit Data</h2>
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
                Genres:
              </label>
              <textarea
                id="genres"
                name="genres"
                value={formData.genres}
                onChange={handleChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                placeholder='Enter genres as JSON array (e.g. ["genre1", "genre2"])'
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="images" style={{ display: 'block', marginBottom: '5px' }}>
                Images:
              </label>
              <textarea
                id="images"
                name="images"
                value={formData.images}
                onChange={handleChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                placeholder='Enter images as JSON array (e.g. [{"url": "image_url"}])'
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="external_urls" style={{ display: 'block', marginBottom: '5px' }}>
                External URLs:
              </label>
              <textarea
                id="external_urls"
                name="external_urls"
                value={formData.external_urls}
                onChange={handleChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                placeholder='Enter external URLs as JSON object (e.g. {"spotify": "url"})'
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
          {message && <p style={{ color: 'green', marginTop: '10px' }}>{message}</p>}
          {error && <p style={{ color: 'red', marginTop: '10px' }}>Error: {error}</p>}
        </div>
      </div>
    </div>
  );
}
