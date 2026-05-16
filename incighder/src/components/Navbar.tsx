import Link from 'next/link';

export default function Navbar() {
  return (
    <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '1rem', backgroundColor: '#f8f9fa' }}>
      <Link href="/">Artists</Link>
      <Link href="/search_spotify">Search Spotify</Link>
      <Link href="/artists/add">Add Artist Manually</Link>
    </nav>
  );
}
