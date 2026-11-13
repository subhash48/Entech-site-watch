import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">This page does not exist in SiteWatch.</p>
      <Button asChild variant="outline" size="sm"><Link href="/">Back to overview</Link></Button>
    </div>
  );
}
