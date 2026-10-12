import Link from "next/link";
import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import type { MockUser } from "@/mock/data";

export function Brand({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg font-semibold text-fg"
    >
      <GraduationCap aria-hidden="true" className="size-6 text-link" />
      <span>Grading system</span>
    </Link>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Current user: initials always, name from sm (the name stays available to screen readers). */
export function UserBadge({ user, roleLabel }: { user: MockUser; roleLabel: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="leading-tight font-medium">{user.name}</p>
        <p className="text-xs text-fg-muted">{roleLabel}</p>
      </div>
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-link"
      >
        {initials(user.name)}
      </span>
      <span className="sr-only sm:hidden">
        {user.name}, {roleLabel}
      </span>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg">{title}</h1>
        {description && <p className="text-fg-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Marks a page whose real content comes in a later step. */
export function PlaceholderNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 rounded-lg border border-dashed border-border px-4 py-3 text-xs text-fg-muted">
      <span className="font-semibold">Placeholder.</span> {children}
    </p>
  );
}
