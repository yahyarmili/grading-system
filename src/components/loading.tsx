import { LoaderCircle } from "lucide-react";
import { cn } from "cn";

/** Spinning icon. The rotation stops under prefers-reduced-motion (globals.css). */
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden="true" className={cn("size-4 animate-spin", className)} />;
}

/** Placeholder block for content that is loading. Decorative: pair it with LoadingState or aria-busy. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("block animate-pulse rounded-md bg-surface-muted", className)} />
  );
}

/** Announced loading message (role="status"), with a spinner and visible text. */
export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" className={cn("flex items-center justify-center gap-2 py-10 text-fg-muted", className)}>
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
