import Link from "next/link";
import { ChevronLeft, FlaskConical, GraduationCap, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { ReactNode } from "react";

export function Brand({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg font-semibold whitespace-nowrap text-fg"
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
export function UserBadge({ user, roleLabel }: { user: { name: string }; roleLabel: string }) {
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

export type MetaItem = { icon: LucideIcon; label: ReactNode };

/** Facts about the page subject (classes, due date, counts), on one wrapping line. */
export function MetaList({ items, className }: { items: MetaItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted", className)}>
      {items.map(({ icon: Icon, label }, i) => (
        <li key={i} className="inline-flex items-center gap-1.5">
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: MetaItem[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-lg">{title}</h1>
        {meta && meta.length > 0 && <MetaList items={meta} />}
      </div>
      {actions}
    </div>
  );
}

/** Link back to the parent list, above the page title. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-2 inline-flex items-center gap-1 rounded-sm text-fg-muted hover:text-fg"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      {children}
    </Link>
  );
}

/** Marks mock content; deliberately quiet so it does not read as product UI. */
export function PlaceholderNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-8 flex items-start gap-1.5 text-xs text-fg-muted">
      <FlaskConical aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-semibold">Mockup.</span> {children}
      </span>
    </p>
  );
}
