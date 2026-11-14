import type { Metadata } from "next";
import { DataView } from "@/components/views/data-view";

export const metadata: Metadata = { title: "Data Management" };

export default function Page() {
  return <DataView />;
}
