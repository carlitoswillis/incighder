"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, LogOut, Menu, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DataApiStatusBanner } from "@/components/data-api-status-banner";
import { AdminProvider, useAdmin } from "@/components/admin-context";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";

const NAV = [
  { href: "/", label: "Artists" },
  { href: "/table", label: "Table" },
  { href: "/discover", label: "Discover", admin: true },
  { href: "/artists/add", label: "Manual", admin: true },
  { href: "/artists/bulk", label: "Bulk", admin: true },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <Shell>{children}</Shell>
    </AdminProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { admin } = useAdmin();
  const nav = NAV.filter((item) => !item.admin || admin);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open menu"
                  className="md:hidden"
                />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="text-primary">◐</span> Incighder
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-2">
                {nav.map((item) => (
                  <SheetClose
                    key={item.href}
                    render={<Link href={item.href} />}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm transition-colors",
                      isActive(pathname, item.href)
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <span className="text-lg leading-none text-primary">◐</span>
            Incighder
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  isActive(pathname, item.href)
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {admin && (
              <Button render={<Link href="/search_spotify" />} size="sm">
                <Plus className="size-4" />
                <span className="hidden sm:inline">Add artist</span>
              </Button>
            )}
            {admin ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Sign out"
                onClick={signOut}
              >
                <LogOut />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Admin sign in"
                render={<Link href="/login" />}
              >
                <Lock />
              </Button>
            )}
          </div>
        </div>
      </header>
      <DataApiStatusBanner />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
