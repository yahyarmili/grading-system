"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Copies a value in one click and says so, visibly and to screen readers.
 * Without clipboard access (insecure context, refusal), it says so too:
 * the value stays selectable on the page.
 */
export function CopyButton({ value, label, what }: { value: string; label: string; what: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 3000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {state === "copied" ? "Copied" : label}
      </Button>
      <span role="status" className={state === "failed" ? "text-xs text-fg-muted" : "sr-only"}>
        {state === "copied" ? `${what} copied.` : state === "failed" ? "Copy it by hand: select it, then copy." : ""}
      </span>
    </span>
  );
}
