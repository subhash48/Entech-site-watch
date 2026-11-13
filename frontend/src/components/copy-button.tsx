"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers or contexts without the async clipboard API.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function CopyButton({ text, label = "Copy", size = "sm", variant = "outline" }: {
  text: string; label?: string; size?: "sm" | "xs" | "icon-sm"; variant?: "outline" | "ghost";
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={async () => setState((await copyText(text)) ? "copied" : "failed")}
      aria-label={size === "icon-sm" ? label : undefined}
    >
      {state === "copied" ? <Check /> : <Copy />}
      {size !== "icon-sm" && (state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label)}
    </Button>
  );
}
