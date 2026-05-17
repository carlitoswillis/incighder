'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { calculateArtistScore } from '../utils/score';

interface ArtistImage {
  url: string;
}

interface Artist {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string | null;
  images: ArtistImage[] | null;
  external_urls: { [key: string]: string } | null;
  monthly_listeners: number | null;
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
      const data: Artist[] = await response.json();
      setArtists(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
      fetchArtists();
    } catch (e: unknown) {
      console.error('Error deleting artist:', e);
      alert(`Failed to delete artist: ${e instanceof Error ? e.message : String(e)}`);
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
        <div>
          {artists.map((artist) => {
            let parsedGenres: string[] = [];
            if (artist.genres) {
              const cleaned = artist.genres.replace(/[\[\]"']/g, '');
              parsedGenres = cleaned ? cleaned.split(',').map(s => s.trim()) : [];
            }

            const displayImage = artist.images && artist.images.length > 0 ? artist.images[0].url : null;
            const spotifyUrl = artist.external_urls?.spotify;
            const { score } = calculateArtistScore(artist);

            return (
              <div key={artist.id} className="artist-card">
                <button onClick={() => handleDelete(artist.id)} className="remove-button">X</button>
                <div>
                  {displayImage && (
                    <Image
                      src={displayImage}
                      alt={artist.name}
                      width={100}
                      height={100}
                    />
                  )}
                </div>
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