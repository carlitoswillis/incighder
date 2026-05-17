'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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

function ArtistDetailComponent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const artistId = params.id as string;
  const editMode = searchParams.get('edit') === 'true';

  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    followers: '',
    popularity: '',
    genres: '',
    images: '',
    external_urls: '',
    monthly_listeners: ''
  });
  const [showEditForm, setShowEditForm] = useState(editMode);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setShowEditForm(editMode);
  }, [editMode]);

  useEffect(() => {
    async function loadArtist() {
      if (!artistId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/artists/${artistId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setArtist(data);
        setFormData({
          name: data.name || '',
          followers: String(data.followers || ''),
          popularity: String(data.popularity || ''),
          genres: data.genres || '',
          images: Array.isArray(data.images) ? data.images.map((img: any) => img.url || img).join(', ') : '',
          external_urls: data.external_urls ? JSON.stringify(data.external_urls, null, 2) : '',
          monthly_listeners: String(data.monthly_listeners || '')
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    loadArtist();
  }, [artistId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      let parsedUrls = null;
      if (formData.external_urls) {
        try {
          parsedUrls = JSON.parse(formData.external_urls);
        } catch (e) {
          const parts = formData.external_urls.split('},');
          parsedUrls = parts.reduce((acc, curr) => {
            const jsonString = curr.trim().endsWith('}') ? curr.trim() : curr.trim() + '}';
            return { ...acc, ...JSON.parse(jsonString) };
          }, {});
        }
      }

      const dataToSend = {
        ...formData,
        genres: formData.genres.split(',').map((s) => s.trim()).filter((s) => s),
        images: formData.images.split(',').map((s) => s.trim()).filter((s) => s).map(url => ({ url })),
        external_urls: parsedUrls,
      };

      const response = await fetch(`/api/artists/${artistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        throw new Error('Failed to update artist');
      }

      setMessage('Artist data updated successfully!');
      const updatedResponse = await fetch(`/api/artists/${artistId}`);
      const data = await updatedResponse.json();
      setArtist(data);
    } catch (e: any) {
      setError(`Failed to update artist: ${e.message}`);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
  if (!artist) return <div>Artist not found.</div>;

  let parsedGenres: string[] = [];
  try {
    parsedGenres = artist.genres ? artist.genres.split(',') : [];
  } catch (e) { }

  const { score, breakdown } = calculateArtistScore(artist);

  return (
    <div>
      <h1 style={{ fontSize: '2em', marginBottom: '20px', textAlign: 'center' }}>{artist.name}</h1>
      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', maxWidth: '600px', margin: '0 auto', backgroundColor: '#fff' }}>
        {artist.images && artist.images.length > 0 && (
          <img src={artist.images[0].url} alt={artist.name} style={{ width: '120px', height: '120px', borderRadius: '50%', display: 'block', margin: '0 auto 15px' }} />
        )}
        <p><strong>ID:</strong> {artist.id}</p>
        <p><strong>Score:</strong> {score}</p>
        <pre style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '5px', fontSize: '0.9em', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{breakdown}</pre>
        <p><strong>Genres:</strong> {parsedGenres.length > 0 ? parsedGenres.join(', ') : 'N/A'}</p>
        <button onClick={() => setShowEditForm(!showEditForm)} style={{ backgroundColor: '#6c757d', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '10px' }}>
          {showEditForm ? 'Hide Edit Form' : 'Edit Data'}
        </button>
        {showEditForm && (
          <form onSubmit={handleSave}>
            <input name="name" value={formData.name} onChange={handleChange} placeholder="Name" style={{ width: '100%', marginBottom: '10px' }} />
            <input name="genres" value={formData.genres} onChange={handleChange} placeholder="Genres (comma separated)" style={{ width: '100%', marginBottom: '10px' }} />
            <textarea name="images" value={formData.images} onChange={handleChange} placeholder="Images (comma separated URLs)" style={{ width: '100%', marginBottom: '10px' }} />
            <textarea name="external_urls" value={formData.external_urls} onChange={handleChange} placeholder="External URLs (JSON object)" style={{ width: '100%', marginBottom: '10px' }} />
            <button type="submit" style={{ backgroundColor: '#007bff', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save Changes</button>
          </form>
        )}
        {message && <p style={{ color: 'green' }}>{message}</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      </div>
    </div>
  );
}

export default function ArtistDetailPage() {
  return <Suspense fallback={<div>Loading...</div>}><ArtistDetailComponent /></Suspense>;
}
