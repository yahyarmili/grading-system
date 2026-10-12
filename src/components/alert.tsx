import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

type AlertTone = "info" | "warning" | "error";

const tones: Record<AlertTone, { className: string; icon: LucideIcon; label: string }> = {
  info: { className: "border-info-border bg-info-bg", icon: Info, label: "Information" },
  warning: { className: "border-warning-border bg-warning-bg", icon: TriangleAlert, label: "Warning" },
  error: { className: "border-danger-border bg-danger-bg", icon: CircleAlert, label: "Error" },
};

const iconColor: Record<AlertTone, string> = {
  info: "text-info-fg",
  warning: "text-warning-fg",
  error: "text-danger-fg",
};

/**
 * Inline message. Icon + title carry the tone; the body text stays in the
 * regular text color for contrast. `live` announces an alert that appears
 * after an action (role="alert" for errors, role="status" otherwise).
 */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  live = false,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  live?: boolean;
  className?: string;
}) {
  const { className: toneClass, icon: Icon, label } = tones[tone];
  const role = live ? (tone === "error" ? "alert" : "status") : undefined;

  return (
    <div
      role={role}
      className={cn("flex gap-3 rounded-lg border px-4 py-3", toneClass, className)}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", iconColor[tone])} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-semibold">
          {/* The tone is spelled out for screen readers when the title does not say it. */}
          <span className="sr-only">{label}: </span>
          {title ?? label}
        </p>
        {children && <div className="text-fg">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
