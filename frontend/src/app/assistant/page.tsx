import type { Metadata } from "next";
import { AssistantView } from "@/components/views/assistant-view";

export const metadata: Metadata = { title: "AI Assistant" };

export default function Page() {
  return <AssistantView />;
}
