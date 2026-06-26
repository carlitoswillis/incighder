"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Import (add new artists via Spotify) and Refresh (re-discover + re-scrape
// existing ones) are distinct flows but both bulk operations on the roster, so
// they share one entry point and switch via these tabs.
const TABS = [
  { href: "/artists/bulk", label: "Import", icon: Plus },
  { href: "/artists/refresh", label: "Refresh", icon: RefreshCw },
];

export function BulkTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 inline-flex gap-1 rounded-lg bg-secondary/40 p-1">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-card text-foreground ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
