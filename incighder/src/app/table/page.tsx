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
        const data = await response.json();
        setArtists(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchArtists();
  }, []);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading artists...</div>;
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center text-red-500">Error: {error}</div>;
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8 text-center">Artists Data Table</h1>
      {artists.length === 0 ? (
        <p className="text-center text-lg">No artists found in the database. Try running the scraper!</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <thead className="bg-gray-200 dark:bg-gray-700">
              <tr>
                <th className="py-3 px-4 text-left text-gray-600 dark:text-gray-200 font-semibold text-sm">Name</th>
                <th className="py-3 px-4 text-left text-gray-600 dark:text-gray-200 font-semibold text-sm">Followers</th>
                <th className="py-3 px-4 text-left text-gray-600 dark:text-gray-200 font-semibold text-sm">Popularity</th>
                <th className="py-3 px-4 text-left text-gray-600 dark:text-gray-200 font-semibold text-sm">Genres</th>
                <th className="py-3 px-4 text-left text-gray-600 dark:text-gray-200 font-semibold text-sm">Spotify URL</th>
              </tr>
            </thead>
            <tbody>
              {artists.map((artist) => {
                let parsedGenres: string[] = [];
                try {
                  parsedGenres = artist.genres ? JSON.parse(artist.genres) : [];
                } catch (e) {
                  console.error("Error parsing genres:", artist.genres, e);
                }
                const spotifyUrl = artist.external_urls ? artist.external_urls.spotify : null;

                return (
                  <tr key={artist.id} className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-3 px-4 text-gray-800 dark:text-gray-200">
                      <a href={`/artists/${artist.id}`} className="text-blue-500 hover:underline">
                        {artist.name}
                      </a>
                    </td>
                    <td className="py-3 px-4 text-gray-800 dark:text-gray-200">{artist.followers.toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-800 dark:text-gray-200">{artist.popularity}</td>
                    <td className="py-3 px-4 text-gray-800 dark:text-gray-200">{parsedGenres.length > 0 ? parsedGenres.join(', ') : 'N/A'}</td>
                    <td className="py-3 px-4">
                      {spotifyUrl ? (
                        <a
                          href={spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
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
