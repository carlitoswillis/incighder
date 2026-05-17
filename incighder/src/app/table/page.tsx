'use client';

import { useState, useEffect } from 'react';

interface Artist {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string | null;
  images: { url: string }[] | null;
  external_urls: { [key: string]: string } | null;
}

export default function ArtistsTable() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchArtists() {
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
    }

    fetchArtists();
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading artists...</div>;
  }

  if (error) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '2em', marginBottom: '20px', textAlign: 'center' }}>Artists Data Table</h1>
      {artists.length === 0 ? (
        <p style={{ textAlign: 'center', fontSize: '1.2em' }}>No artists found in the database. Try running the scraper!</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="spreadsheet-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Followers</th>
                <th>Popularity</th>
                <th>Genres</th>
                <th>Spotify URL</th>
              </tr>
            </thead>
            <tbody>
              {artists.map((artist) => {
                let parsedGenres: string[] = [];
                if (artist.genres) {
                  const cleaned = artist.genres.replace(/[\[\]"']/g, '');
                  parsedGenres = cleaned ? cleaned.split(',').map(s => s.trim()) : [];
                }
                const spotifyUrl = artist.external_urls?.spotify;

                return (
                  <tr key={artist.id}>
                    <td>
                      <a href={`/artists/${artist.id}`}>
                        {artist.name}
                      </a>
                    </td>
                    <td>{artist.followers.toLocaleString()}</td>
                    <td>{artist.popularity}</td>
                    <td>{parsedGenres.length > 0 ? parsedGenres.join(', ') : 'N/A'}</td>
                    <td>
                      {spotifyUrl ? (
                        <a
                          href={spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Link
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}