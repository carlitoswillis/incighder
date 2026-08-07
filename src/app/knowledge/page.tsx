import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import KnowledgeBrowser from "./knowledge-browser";

export const metadata: Metadata = { title: "Knowledge" };

export default function KnowledgePage() {
  return (
    <Suspense fallback={<Skeleton className="h-44 w-full rounded-xl" />}>
      <KnowledgeBrowser />
    </Suspense>
  );
}
