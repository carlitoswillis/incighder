interface ArtistDataForScore {
  followers: number;
  popularity: number;
  monthly_listeners: number | null;
}

export const calculateArtistScore = (artist: ArtistDataForScore): {
  score: number;
  breakdown: string;
} => {
  let score = 0;
  let breakdown = 'Score Breakdown:\n';

  // Factor in followers (logarithmic scale to reduce impact of huge numbers)
  if (artist.followers > 0) {
    const followerFactor = Math.log10(artist.followers) * 10; // Max ~70 for 10M followers
    score += followerFactor;
    breakdown += `- Followers: +${followerFactor.toFixed(2)} (from ${artist.followers.toLocaleString()} followers)\n`;
  } else {
    breakdown += `- Followers: 0 (no followers)\n`;
  }

  // Factor in popularity (direct scale, 0-100)
  const popularityFactor = artist.popularity * 0.5; // Max 50 for 100 popularity
  score += popularityFactor;
  breakdown += `- Popularity: +${popularityFactor.toFixed(2)} (from ${artist.popularity} popularity)\n`;

  // Factor in monthly listeners (if available, direct scale)
  if (artist.monthly_listeners !== null && artist.monthly_listeners > 0) {
    const listenerFactor = Math.log10(artist.monthly_listeners) * 15; // Max ~105 for 10M listeners
    score += listenerFactor;
    breakdown += `- Monthly Listeners: +${listenerFactor.toFixed(2)} (from ${artist.monthly_listeners.toLocaleString()} listeners)\n`;
  } else {
    breakdown += `- Monthly Listeners: 0 (not available or 0)\n`;
  }

  // Cap score to a reasonable maximum if needed, or normalize later
  score = Math.min(score, 200); // Example cap

  breakdown += `\nTotal Score: ${score.toFixed(2)}`;

  return { score: parseFloat(score.toFixed(2)), breakdown };
};