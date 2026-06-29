// Base URL of the Python data-api (search, discovery, scraping, link preview).
// Localhost in dev; set DATA_API_URL in the deployment env (e.g. Vercel) to the
// publicly-hosted data-api. The frontend reads what the scraper writes via MySQL,
// but these endpoints proxy live operations that still need the service reachable.
export const DATA_API_URL = process.env.DATA_API_URL || "http://127.0.0.1:5050";
