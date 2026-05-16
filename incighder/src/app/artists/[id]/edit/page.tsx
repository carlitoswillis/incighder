'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

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

export default function ArtistEditPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.id as string;

  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Artist>>({});
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
      console.log("Raw API data:", data);
      setArtist(data);

      const parseListField = (field: any) => {
        console.log("Parsing field:", field);
        if (!field) return '';
        if (Array.isArray(field)) return field.join(', ');
        if (typeof field === 'string') {
          try {
            const parsed = JSON.parse(field);
            return Array.isArray(parsed) ? parsed.join(', ') : parsed;
          } catch {
            return field.replace(/[^a-zA-Z0-9, ]/g, '');
          }
        }
        return String(field);
      };

      const cleanedGenres = parseListField(data.genres);
      console.log("Cleaned genres:", cleanedGenres);
      setFormData({
        id: data.id,
        name: data.name,
        followers: data.followers,
        popularity: data.popularity,
        genres: cleanedGenres,
        images: parseListField(data.images),
        external_urls: data.external_urls ? JSON.stringify(data.external_urls, null, 2) : '',
        monthly_listeners: data.monthly_listeners,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    console.log(`Field ${name} changed to:`, value);
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value === '' ? null : parseInt(value, 10),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const dataToSend: any = { ...formData };
      if (typeof dataToSend.genres === 'string') {
        dataToSend.genres = dataToSend.genres.split(',').map((s: string) => s.trim()).filter((s: string) => s);
      }
      if (typeof dataToSend.images === 'string') {
        dataToSend.images = dataToSend.images.split(',').map((s: string) => s.trim()).filter((s: string) => s);
      }
      if (dataToSend.external_urls) {
        try { JSON.parse(dataToSend.external_urls as string); } catch { throw new Error("External URLs must be valid JSON."); }
      }
      const response = await fetch(`/api/artists/${artistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${errorData.status}`);
      }
      setMessage('Artist data updated successfully!');
      router.push(`/artists/${artistId}`);
    } catch (e: any) {
      setError(`Failed to update artist: ${e.message}`);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading artist data...</div>;
  }

  if (error) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: 'red' }}>Error: {error}</div>;
  }

  if (!artist) {
    return <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>Artist not found.</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2em', marginBottom: '20px', textAlign: 'center' }}>Edit {artist.name}</h1>
      <form onSubmit={handleSubmit} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="id" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>ID:</label>
          <input type="text" id="id" name="id" value={formData.id || ''} readOnly style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#e9e9e9' }} />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Name:</label>
          <input type="text" id="name" name="name" value={formData.name || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="followers" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Followers:</label>
          <input type="number" id="followers" name="followers" value={formData.followers === null ? '' : formData.followers} onChange={handleNumberChange} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="popularity" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Popularity (0-100):</label>
          <input type="number" id="popularity" name="popularity" value={formData.popularity === null ? '' : formData.popularity} onChange={handleNumberChange} min="0" max="100" style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="monthly_listeners" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Monthly Listeners:</label>
          <input type="number" id="monthly_listeners" name="monthly_listeners" value={formData.monthly_listeners === null ? '' : formData.monthly_listeners} onChange={handleNumberChange} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="genres" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Genres (Comma-separated list):</label>
          <textarea 
            id="genres" 
            name="genres" 
            value={(() => {
              const val = typeof formData.genres === 'string' ? formData.genres : String(formData.genres || '');
              const clean = val.replace(/^["']+|["']+$/g, '');
              console.log("Rendering genres textarea with value:", val, "Cleaned for display:", clean);
              return clean;
            })()} 
            onChange={handleChange} 
            rows={5} 
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
          ></textarea>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="images" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Images (Comma-separated list):</label>
          <textarea id="images" name="images" value={formData.images as string || ''} onChange={handleChange} rows={8} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}></textarea>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="external_urls" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>External URLs (JSON Object):</label>
          <textarea id="external_urls" name="external_urls" value={formData.external_urls as string || ''} onChange={handleChange} rows={5} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}></textarea>
        </div>

        <button type="submit" style={{ backgroundColor: '#007bff', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save Changes</button>
        {message && <p style={{ color: 'green', marginTop: '10px' }}>{message}</p>}
        {error && <p style={{ color: 'red', marginTop: '10px' }}>Error: {error}</p>}
      </form>
    </div>
  );
}
