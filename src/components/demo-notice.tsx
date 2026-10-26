import { TriangleAlert } from "lucide-react";
import { DEMO_NOTICE } from "@/lib/texts";

/**
 * Spec 0012 (AC-5): a bar at the top of every production page, not
 * dismissible. The root layout decides when to show it; the icon is
 * decorative, the words carry the warning.
 */
export function DemoNotice() {
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 border-b border-warning-border bg-warning-bg px-4 py-2 text-center text-sm text-fg"
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-warning-fg" />
      <p>{DEMO_NOTICE}</p>
    </div>
  );
}
