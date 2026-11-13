import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SiteStatusBadge } from "@/components/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, sensorType, titleCase } from "@/lib/format";
import type { SiteSummary } from "@/lib/types";

export function SitesTable({ sites }: { sites: SiteSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <Table data-testid="sites-table">
        <TableHeader>
          <TableRow>
            <TableHead>Site</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Sensors</TableHead>
            <TableHead className="text-right">Readings</TableHead>
            <TableHead className="text-right">Exceeded</TableHead>
            <TableHead className="text-right">Missing</TableHead>
            <TableHead className="hidden lg:table-cell">Last exceedance</TableHead>
            <TableHead className="w-8"><span className="sr-only">Open</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((s) => (
            <TableRow key={s.site_id} className="group">
              <TableCell>
                <Link href={`/sites/${s.site_id}`} className="font-medium hover:underline">{s.site_name}</Link>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{s.site_id}</span>
              </TableCell>
              <TableCell><SiteStatusBadge status={s.status} /></TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {s.sensors.map((x) => titleCase(sensorType(x))).join(", ")}
              </TableCell>
              <TableCell className="text-right tabular">{s.total_readings}</TableCell>
              <TableCell className={`text-right tabular ${s.exceeded_count ? "font-semibold text-exceeded" : ""}`}>
                {s.exceeded_count}
              </TableCell>
              <TableCell className={`text-right tabular ${s.missing_data_count ? "font-semibold text-missing" : ""}`}>
                {s.missing_data_count}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {s.last_exceedance_at ? formatDateTime(s.last_exceedance_at) : "—"}
              </TableCell>
              <TableCell>
                <Link href={`/sites/${s.site_id}`} aria-label={`Open ${s.site_name}`}>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
