/* eslint-disable @next/next/no-img-element */
import Image from "next/image";

// Artist avatars come from two worlds: remote CDN URLs (Spotify) that
// next/image should optimize, and uploaded data-URIs (skaters etc. with no
// scrapeable photo) that next/image rejects — those render as a plain <img>.
export function ArtistImage({
  src,
  alt,
  size,
  className,
}: {
  src: string;
  alt: string;
  size: number;
  className?: string;
}) {
  if (src.startsWith("data:")) {
    return (
      <img src={src} alt={alt} width={size} height={size} className={className} />
    );
  }
  return (
    <Image src={src} alt={alt} width={size} height={size} className={className} />
  );
}
