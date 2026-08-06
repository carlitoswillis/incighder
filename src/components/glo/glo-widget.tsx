"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/components/admin-context";
import { GloChat } from "./glo-chat";

/**
 * Floating GLO assistant: a FAB that opens a chat panel — bottom-right card
 * on sm+, full-width bottom sheet on mobile. Admin-only, like the other
 * advanced features (the /api/agent* routes enforce the same gate).
 */
export function GloWidget() {
  const { admin } = useAdmin();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

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
          role="dialog"
          aria-label="GLO assistant"
          className={cn(
            "print-hidden fixed z-50 flex flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-2xl ring-1 ring-white/5",
            // Mobile: full-width bottom sheet
            "inset-x-0 bottom-0 h-[85vh] rounded-t-xl",
            // sm+: floating bottom-right card
            "sm:inset-x-auto sm:right-5 sm:bottom-5 sm:h-[560px] sm:max-h-[80vh] sm:w-[400px] sm:rounded-xl",
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
