'use client';

import { useState } from 'react';

export default function AddArtistPage() {
  const [artistName, setArtistName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newArtistId, setNewArtistId] = useState<string | null>(null);

  const handleManualAdd = async () => {
    const manualArtistData = {
      name: artistName,
      followers: 0,
      popularity: 0,
      genres: [],
      images: null,
      external_urls: { spotify: '' },
      monthly_listeners: 0
    };

    setMessage(null);
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/artists/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(manualArtistData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setMessage(`Manual artist ${artistName} added to dataset successfully!`);
      setNewArtistId(data.artist.id);
      setArtistName('');
    } catch (e: unknown) {
      setError(`Failed to add manual artist: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8 text-center">Add Artist Manually</h1>
      <div className="flex flex-col items-center mb-8">
        <input
          type="text"
          placeholder="Enter artist name"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          className="p-2 border border-gray-300 rounded-md w-full max-w-md mb-4 text-black"
        />
        <button
          onClick={handleManualAdd}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded w-48"
          disabled={loading}
        >
          {loading ? 'Adding...' : 'Add Artist'}
        </button>
      </div>

      {error && <p className="text-red-500 text-center mb-4">Error: {error}</p>}
      {message && (
        <div className="text-green-500 text-center mb-4">
          <p>{message}</p>
          {newArtistId && (
            <a href={`/artists/${newArtistId}?edit=true`} className="text-blue-500 underline font-semibold mt-2 block">
              Go to Edit Page
            </a>
          )}
        </div>
      )}
    </div>
  );
}
