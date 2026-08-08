"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/components/admin-context";
import { GloChat } from "./glo-chat";

/**
 * Floating GLO assistant: a FAB that opens a chat panel — bottom-right card
 * on sm+, full-screen takeover on mobile. Admin-only, like the other
 * advanced features (the /api/agent* routes enforce the same gate).
 */
export function GloWidget() {
  const { admin } = useAdmin();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes the panel from anywhere on the page.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return; // Escape inside an IME cancels composition, not the panel
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Mobile-only: lock the page behind the sheet and keep the sheet owning the
  // whole screen while the iOS keyboard is up. Body position:fixed is the
  // reliable iOS scroll lock (plain overflow:hidden still rubber-bands), and
  // the visualViewport padding keeps the composer above the keyboard while
  // the sheet's own background stays under it — so the translucent iOS
  // keyboard shows the sheet, never the page behind it.
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 639px)").matches) return;
    const body = document.body;
    const scrollY = window.scrollY;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    const vv = window.visualViewport;
    const panel = panelRef.current;
    const onViewport = () => {
      const el = panel;
      if (!el || !vv) return;
      const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Inline style wins over the safe-area padding class; clearing it on
      // keyboard-close hands padding back to the class.
      el.style.paddingBottom = keyboard ? `${keyboard}px` : "";
      window.scrollTo(0, 0); // undo Safari's keyboard pan of the layout viewport
    };
    vv?.addEventListener("resize", onViewport);
    vv?.addEventListener("scroll", onViewport);
    onViewport();
    return () => {
      vv?.removeEventListener("resize", onViewport);
      vv?.removeEventListener("scroll", onViewport);
      if (panel) panel.style.paddingBottom = "";
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!admin) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open GLO assistant"
          onClick={() => setOpen(true)}
          className={cn(
            "print-hidden fixed right-5 bottom-5 z-50 flex size-12 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground shadow-lg shadow-primary/20",
            "transition-transform outline-none hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none",
          )}
        >
          <Sparkles className="size-5" />
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="GLO assistant"
          className={cn(
            "print-hidden fixed z-50 flex flex-col overflow-hidden bg-card text-card-foreground shadow-2xl",
            // Mobile: full-screen takeover — the sheet owns the viewport, so
            // nothing behind it scrolls or shows through the iOS keyboard.
            "inset-0 pb-[env(safe-area-inset-bottom)]",
            // sm+: floating bottom-right card
            "sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[560px] sm:max-h-[80vh] sm:w-[400px] sm:rounded-xl sm:border sm:border-border sm:pb-0 sm:ring-1 sm:ring-white/5",
            // Subtle open animation (tw-animate-css), disabled for reduced motion
            "animate-in fade-in-0 slide-in-from-bottom-4 duration-200 motion-reduce:animate-none",
          )}
        >
          <GloChat onClose={close} />
        </div>
      )}
    </>
  );
}
