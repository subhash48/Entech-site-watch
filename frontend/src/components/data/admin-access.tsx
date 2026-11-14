"use client";

import { useState } from "react";
import { KeyRound, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, toApiError } from "@/lib/api";
import type { AdminStatus } from "@/lib/types";

/** Sign-in for administrators. The token is sent once to the API and never stored in the browser. */
export function AdminAccess({ status, onChange }: { status?: AdminStatus; onChange: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status) return <p className="text-sm text-muted-foreground">Checking access…</p>;

  if (!status.admin_configured) {
    return (
      <div className="space-y-1 text-sm" data-testid="admin-disabled">
        <p className="font-semibold">Uploads are disabled on this server</p>
        <p className="text-muted-foreground">An administrator must set <code className="font-mono text-xs">ADMIN_TOKEN</code> in the
          backend environment to enable dataset management.</p>
      </div>
    );
  }

  if (status.authenticated) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="admin-signed-in">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-normal" aria-hidden /> Signed in as administrator
        </p>
        <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await api.signOut(); } finally { setBusy(false); onChange(); }
        }}>
          <LogOut /> Sign out
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-2" data-testid="admin-sign-in" onSubmit={async (e) => {
      e.preventDefault();
      if (!token.trim()) return;
      setBusy(true);
      setError(null);
      try {
        await api.signIn(token.trim());
        setToken("");
        onChange();
      } catch (err) {
        setError(toApiError(err).message);
      } finally {
        setBusy(false);
      }
    }}>
      <label htmlFor="admin-token" className="text-sm font-medium">Administrator access token</label>
      <div className="flex gap-2">
        <Input id="admin-token" type="password" autoComplete="current-password" value={token}
          onChange={(e) => setToken(e.target.value)} placeholder="Paste the admin token" className="h-9" />
        <Button type="submit" disabled={busy || !token.trim()}>
          {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />} Sign in
        </Button>
      </div>
      {error && <p role="alert" className="text-xs font-medium text-exceeded">{error}</p>}
      <p className="text-xs text-muted-foreground">Only administrators can upload or activate datasets. Everyone else can view the history.</p>
    </form>
  );
}
