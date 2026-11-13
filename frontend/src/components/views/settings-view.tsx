"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useChat } from "@/components/chat/chat-provider";
import { useData } from "@/components/data-provider";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { API_BASE_URL } from "@/lib/api";
import { formatLoadedAt, formatNumber } from "@/lib/format";

const subscribe = () => () => {};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-all sm:text-right">{children}</dd>
    </div>
  );
}

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { overview, health, error } = useData();
  const { status } = useChat();

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Appearance, connection and data configuration. Thresholds are read from thresholds.json." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3">
          <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Theme for this browser.</CardDescription></CardHeader>
          <CardContent>
            <ToggleGroup type="single" variant="outline" value={mounted ? theme : undefined}
              onValueChange={(v) => v && setTheme(v)} aria-label="Theme">
              <ToggleGroupItem value="light"><Sun /> Light</ToggleGroupItem>
              <ToggleGroupItem value="dark"><Moon /> Dark</ToggleGroupItem>
              <ToggleGroupItem value="system"><Monitor /> System</ToggleGroupItem>
            </ToggleGroup>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader><CardTitle>API connection</CardTitle><CardDescription>Set with NEXT_PUBLIC_API_BASE_URL.</CardDescription></CardHeader>
          <CardContent>
            <dl>
              <Row label="Backend URL"><span className="font-mono text-xs">{API_BASE_URL}</span></Row>
              <Row label="Status">{error ? <span className="text-exceeded">Offline</span> : health ? <span className="text-normal">Connected</span> : "Checking…"}</Row>
              <Row label="API version">{health?.version ?? "—"}</Row>
              <Row label="Environment">{health?.environment ?? "—"}</Row>
            </dl>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader><CardTitle>Data source</CardTitle><CardDescription>{overview?.data_source.note ?? "—"}</CardDescription></CardHeader>
          <CardContent>
            <dl>
              <Row label="Files">{overview?.data_source.files.join(", ") ?? "—"}</Row>
              <Row label="Loaded">{formatLoadedAt(overview?.data_source.loaded_at)}</Row>
              <Row label="Readings · sites · rules">{health ? `${health.readings_loaded} · ${health.sites_loaded} · ${health.thresholds_loaded}` : "—"}</Row>
              <Row label="Validation warnings">{overview ? overview.validation.warnings.length + overview.validation.invalid_rows.length : "—"}</Row>
            </dl>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader><CardTitle>SiteWatch AI</CardTitle><CardDescription>The provider key is stored only in the backend environment.</CardDescription></CardHeader>
          <CardContent>
            <dl>
              <Row label="Status">{status ? (status.configured ? <span className="text-normal">Configured</span> : <span className="text-missing">Not configured</span>) : "Checking…"}</Row>
              <Row label="Provider">{status?.provider ?? "—"}</Row>
              <Row label="Model">{status?.model ?? "—"}</Row>
            </dl>
            {status && !status.configured && <p className="pt-2 text-xs text-muted-foreground">{status.message}</p>}
          </CardContent>
        </Card>

        <Card className="gap-3 lg:col-span-2">
          <CardHeader><CardTitle>Thresholds</CardTitle><CardDescription>Configured per sensor in thresholds.json. A reading is exceeded only when value &gt; limit.</CardDescription></CardHeader>
          <CardContent className="px-2 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Sensor</TableHead><TableHead className="text-right">Limit</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Readings</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {overview?.sensor_breakdown.map((b) => (
                  <TableRow key={b.sensor}>
                    <TableCell>{b.label} <span className="ml-1 font-mono text-xs text-muted-foreground">{b.sensor}</span></TableCell>
                    <TableCell className="text-right tabular">{b.threshold === null ? <span className="text-missing">Not configured</span> : formatNumber(b.threshold)}</TableCell>
                    <TableCell>{b.unit ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">{b.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
