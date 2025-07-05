'use client';

import { useState, useEffect } from 'react';

interface Artist {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string | null;
  images: any[] | null;
  external_urls: any | null;
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
    return <div>Loading artists...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Artists from Spotify</h1>
      {artists.length === 0 ? (
        <p>No artists found in the database. Try running the scraper!</p>
      ) : (
        <div>
          {artists.map((artist) => {
            let parsedGenres: string[] = [];
            try {
              parsedGenres = artist.genres ? JSON.parse(artist.genres) : [];
            } catch (e) {
              console.error("Error parsing genres:", artist.genres, e);
            }

            const displayImage = artist.images && artist.images.length > 0 ? artist.images[0].url : null;
            const spotifyUrl = artist.external_urls ? artist.external_urls.spotify : null;

            return (
              <div key={artist.id} className="artist-card-layout">
                <button onClick={() => handleDelete(artist.id)} style={{ position: 'absolute', top: '10px', right: '10px' }}>X</button>
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
                <div className="artist-info-column">
                  <h2>
                    <a href={`/artists/${artist.id}`}>
                      {artist.name}
                    </a>
                  </h2>
                  <p><strong>Followers:</strong> {artist.followers.toLocaleString()}</p>
                  <p><strong>Popularity:</strong> {artist.popularity}</p>
                  <p><strong>Genres:</strong> {parsedGenres.length > 0 ? parsedGenres.join(', ') : 'N/A'}</p>
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
