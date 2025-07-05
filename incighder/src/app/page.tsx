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
    return <div className="flex min-h-screen items-center justify-center">Loading artists...</div>;
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center text-red-500">Error: {error}</div>;
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8 text-center">Artists from Spotify</h1>
      {artists.length === 0 ? (
        <p className="text-center text-lg">No artists found in the database. Try running the scraper!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <div key={artist.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 relative grid grid-cols-[auto_1fr] gap-4 items-start">
                <button
                  onClick={() => handleDelete(artist.id)}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-full text-xs"
                >
                  X
                </button>
                {displayImage && (
                  <img
                    src={displayImage}
                    alt={artist.name}
                    className="w-24 h-24 rounded-full"
                  />
                )}
                <div className="flex flex-col">
                  <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
                    <a href={`/artists/${artist.id}`} className="hover:underline">
                      {artist.name}
                    </a>
                  </h2>
                  <p className="text-gray-700 dark:text-gray-300"><strong>Followers:</strong> {artist.followers.toLocaleString()}</p>
                  <p className="text-gray-700 dark:text-gray-300"><strong>Popularity:</strong> {artist.popularity}</p>
                  <p className="text-gray-700 dark:text-gray-300"><strong>Genres:</strong> {parsedGenres.length > 0 ? parsedGenres.join(', ') : 'N/A'}</p>
                  {spotifyUrl && (
                    <a
                      href={spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline mt-2 block"
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
