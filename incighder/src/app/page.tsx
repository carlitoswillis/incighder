'use client';

import { useState, useEffect } from 'react';
import { calculateArtistScore } from '../utils/score';

interface Artist {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string | null;
  images: any[] | null;
  external_urls: any | null;
  monthly_listeners: number | null; // Added monthly_listeners
}

export default function Home() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArtists = async () => {
    try {
      const response = await fetch('/api/artists');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setArtists(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtists();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this artist?')) {
      return;
    }
    try {
      const response = await fetch(`/api/artists/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // Refetch artists after successful deletion
      fetchArtists();
    } catch (e: any) {
      console.error('Error deleting artist:', e);
      alert(`Failed to delete artist: ${e.message}`);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading artists...</div>;
  }

  if (error) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '2em', marginBottom: '20px', textAlign: 'center' }}>Artists</h1>
      {artists.length === 0 ? (
        <p style={{ textAlign: 'center', fontSize: '1.2em' }}>No artists found in the database. Try running the scraper!</p>
      ) : (
        <div> {/* Changed from grid to simple div */}
          {artists.map((artist) => {
            let parsedGenres: string[] = [];
            if (artist.genres) {
              if (Array.isArray(artist.genres)) {
                parsedGenres = artist.genres;
              } else if (typeof artist.genres === 'string') {
                // Remove brackets/quotes and split by comma if needed
                const cleaned = artist.genres.replace(/[\[\]"']/g, '');
                parsedGenres = cleaned ? cleaned.split(',').map(s => s.trim()) : [];
              }
            }

            const displayImage = artist.images && artist.images.length > 0 ? artist.images[0].url : null;
            const spotifyUrl = artist.external_urls ? artist.external_urls.spotify : null;

            const { score } = calculateArtistScore(artist);

            return (
              <div key={artist.id} className="artist-card">
                <button onClick={() => handleDelete(artist.id)} className="remove-button">X</button>
                {/* Image container */}
                <div>
                  {displayImage && (
                    <img
                      src={displayImage}
                      alt={artist.name}
                    />
                  )}
                </div>
                {/* Info container */}
                <div className="artist-info">
                  <h2>
                    <a href={`/artists/${artist.id}`}>
                      {artist.name}
                    </a>
                  </h2>
                  <p><strong>Score:</strong> {score}</p>
                  <p><strong>Followers:</strong> {artist.followers !== null ? artist.followers.toLocaleString() : 'N/A'}</p>
                  <p><strong>Popularity:</strong> {artist.popularity !== null ? artist.popularity : 'N/A'}</p>
                  <p><strong>Genres:</strong> {parsedGenres.length > 0 ? parsedGenres.join(', ') : 'N/A'}</p>
                  {artist.monthly_listeners !== null && (
                    <p><strong>Monthly Listeners:</strong> {artist.monthly_listeners.toLocaleString()}</p>
                  )}
                  {spotifyUrl && (
                    <a
                      href={spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on Spotify
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}