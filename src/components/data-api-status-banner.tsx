"use client";

import { useEffect, useState } from "react";

// Slim warning bar shown when the data-api (usually a tunnel to the home
// machine) is unreachable: live scraping/refresh/discover won't work, but
// browsing and editing (direct DB) still do. Polls /api/data-api-status.
export function DataApiStatusBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/data-api-status", { cache: "no-store" });
        const d = await r.json();
        if (alive) setOffline(!d.online);
      } catch {
        if (alive) setOffline(true);
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-400">
      Live scraping is offline — the home data server is unreachable. Browsing
      and editing artists still works; scrape, refresh and discover are paused.
    </div>
  );
}
