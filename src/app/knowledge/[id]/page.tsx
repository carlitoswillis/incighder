import type { Metadata } from "next";
import KnowledgeItemDetail from "./knowledge-item";

export const metadata: Metadata = { title: "Knowledge" };

export default function KnowledgeItemPage() {
  return <KnowledgeItemDetail />;
}
