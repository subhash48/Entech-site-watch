import type { Metadata } from "next";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/states";
import { ReadingsView } from "@/components/views/readings-view";

export const metadata: Metadata = { title: "Sensors" };

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
      <ReadingsView />
    </Suspense>
  );
}
