import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

/** Shown when a list has nothing to display: what is missing, and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-10 text-center", className)}>
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-surface-muted">
        <Icon aria-hidden="true" className="size-6 text-fg-muted" />
      </span>
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="max-w-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
