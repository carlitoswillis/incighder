'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

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
    return <div className="flex min-h-screen items-center justify-center">Loading artist details...</div>;
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center text-red-500">Error: {error}</div>;
  }

  if (!artist) {
    return <div className="flex min-h-screen items-center justify-center">Artist not found.</div>;
  }

  let parsedGenres: string[] = [];
  try {
    parsedGenres = artist.genres ? JSON.parse(artist.genres) : [];
  } catch (e) {
    console.error("Error parsing genres:", artist.genres, e);
  }

  const displayImage = artist.images && artist.images.length > 0 ? artist.images[0].url : null;
  const spotifyUrl = artist.external_urls ? artist.external_urls.spotify : null;

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8 text-center">{artist.name}</h1>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 max-w-2xl mx-auto">
        {displayImage && (
          <img
            src={displayImage}
            alt={artist.name}
            className="w-32 h-32 rounded-full mx-auto mb-4"
          />
        )}
        <p className="text-gray-700 dark:text-gray-300 mb-2"><strong>ID:</strong> {artist.id}</p>
        <p className="text-gray-700 dark:text-gray-300 mb-2"><strong>Followers:</strong> {artist.followers.toLocaleString()}</p>
        <p className="text-gray-700 dark:text-gray-300 mb-2"><strong>Popularity:</strong> {artist.popularity}</p>
        <p className="text-gray-700 dark:text-gray-300 mb-2"><strong>Genres:</strong> {parsedGenres.length > 0 ? parsedGenres.join(', ') : 'N/A'}</p>
        {spotifyUrl && (
          <p className="mb-2">
            <a
              href={spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              View on Spotify
            </a>
          </p>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold mb-4">Edit Data</h2>
          <div className="mb-4">
            <label htmlFor="monthlyListeners" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
              Monthly Listeners:
            </label>
            <input
              type="number"
              id="monthlyListeners"
              value={monthlyListenersInput}
              onChange={(e) => setMonthlyListenersInput(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline bg-gray-100 dark:bg-gray-700 dark:text-white"
              placeholder="Enter monthly listeners"
            />
          </div>
          <button
            onClick={handleSave}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            Save Changes
          </button>
          {message && <p className="text-green-500 mt-4">{message}</p>}
          {error && <p className="text-red-500 mt-4">Error: {error}</p>}
        </div>
      </div>
    </div>
  );
}
