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
  const [monthlyListenersInput, setMonthlyListenersInput] = useState<string>('');
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
      setArtist(data);
      setMonthlyListenersInput(data.monthly_listeners ? String(data.monthly_listeners) : '');
    } catch (e: any) {
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

  const handleSave = async () => {
    setMessage(null);
    setError(null);
    try {
      const updatedMonthlyListeners = monthlyListenersInput === '' ? null : parseInt(monthlyListenersInput, 10);
      if (monthlyListenersInput !== '' && isNaN(updatedMonthlyListeners as number)) {
        throw new Error("Monthly listeners must be a number.");
      }

      const response = await fetch(`/api/artists/${artistId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ monthly_listeners: updatedMonthlyListeners }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      setMessage('Artist data updated successfully!');
      fetchArtist(); // Re-fetch to show updated data
    } catch (e: any) {
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
        <p><strong>Followers:</strong> {artist.followers.toLocaleString()}</p>
        <p><strong>Popularity:</strong> {artist.popularity}</p>
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
          {/* Link to the new edit page */}
          <button
            onClick={() => router.push(`/artists/${artistId}/edit`)}
            style={{ backgroundColor: '#28a745', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '15px' }}
          >
            Edit All Fields
          </button>

          {/* Original Monthly Listeners Edit Form */}
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="monthlyListeners" style={{ display: 'block', marginBottom: '5px' }}>
              Monthly Listeners:
            </label>
            <input
              type="number"
              id="monthlyListeners"
              value={monthlyListenersInput}
              onChange={(e) => setMonthlyListenersInput(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              placeholder="Enter monthly listeners"
            />
          </div>
          <button
            onClick={handleSave}
            style={{ backgroundColor: '#007bff', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Save Monthly Listeners
          </button>
          {message && <p style={{ color: 'green', marginTop: '10px' }}>{message}</p>}
          {error && <p style={{ color: 'red', marginTop: '10px' }}>Error: {error}</p>}
        </div>
      </div>
    </div>
  );
}