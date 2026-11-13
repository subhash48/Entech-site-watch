import type { Metadata } from "next";
import { SitesView } from "@/components/views/sites-view";

export const metadata: Metadata = { title: "Sites" };

export default function Page() {
  return <SitesView />;
}
