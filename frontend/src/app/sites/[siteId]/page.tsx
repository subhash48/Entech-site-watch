import type { Metadata } from "next";
import { SiteDetailView } from "@/components/views/site-detail-view";

export const metadata: Metadata = { title: "Site details" };

export default function Page() {
  return <SiteDetailView />;
}
