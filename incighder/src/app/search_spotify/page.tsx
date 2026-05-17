'use client';

import { useState } from 'react';
import Image from 'next/image';

interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
  popularity: number;
  followers: { total: number };
  external_urls: { spotify: string };
}

export default function SearchArtists() {
  const [artistName, setArtistName] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    setSearchResults([]);

    try {
      const response = await fetch(`/api/spotify-search?q=${encodeURIComponent(artistName)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSearchResults(data.artists.items);
      if (data.artists.items.length === 0) {
        setMessage('No artists found for your search.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAddToDataset = async (artist: SpotifyArtist) => {
    setMessage(null);
    try {
      const response = await fetch('/api/artists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(artist),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      setMessage(`Artist ${artist.name} added to dataset successfully!`);
    } catch (e: unknown) {
      setError(`Failed to add artist: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8 text-center">Search Spotify for Artists</h1>
      <div className="flex flex-col items-center mb-8">
        <input
          type="text"
          placeholder="Enter artist name"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          className="p-2 border border-gray-300 rounded-md w-full max-w-md mb-4 text-black"
        />
        <button
          onClick={handleSearch}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mb-2 w-48"
          disabled={loading}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && <p className="text-red-500 text-center mb-4">Error: {error}</p>}
      {message && <p className="text-green-500 text-center mb-4">{message}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {searchResults.map((artist) => (
          <div key={artist.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-black dark:text-white">
            <h2 className="text-2xl font-semibold mb-2">{artist.name}</h2>
            {artist.images && artist.images.length > 0 ? (
              <Image
                src={artist.images[0].url}
                alt={artist.name}
                width={96}
                height={96}
                className="rounded-full mx-auto mb-4"
              />
            ) : (
              <div className="w-24 h-24 rounded-full mx-auto mb-4 bg-gray-300 flex items-center justify-center text-gray-600 font-bold">?</div>
            )}
            <p><strong>Popularity:</strong> {artist.popularity}</p>
            <p><strong>Followers:</strong> {artist.followers.total.toLocaleString()}</p>
            <p><strong>Genres:</strong> {artist.genres.join(', ') || 'N/A'}</p>
            {artist.external_urls?.spotify && (
              <a
                href={artist.external_urls.spotify}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline block mt-2"
              >
                View on Spotify
              </a>
            )}
            <button
              onClick={() => handleAddToDataset(artist)}
              className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded w-full"
            >
              Add to Dataset
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
