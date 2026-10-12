"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { isCurrent, navigation, type Role } from "./navigation";

type Variant = "sidebar" | "bottom" | "top";

const styles: Record<Variant, { list: string; link: string; current: string }> = {
  // Teacher sidebar: the current item has a tinted fill, bold text and a bar on the right.
  sidebar: {
    list: "flex flex-col gap-1 p-2",
    link: "relative flex min-h-10 items-center gap-3 rounded-lg px-4 text-fg hover:bg-surface-muted",
    current:
      "bg-primary-soft font-semibold text-link hover:bg-primary-soft after:absolute after:inset-y-1 after:right-0 after:w-[3px] after:rounded-full after:bg-primary",
  },
  // Student phone tab bar: icon above label, the current tab has a bar on top and bold text.
  bottom: {
    list: "grid grid-flow-col auto-cols-fr",
    link: "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-fg-muted",
    current:
      "font-semibold text-link before:absolute before:inset-x-6 before:top-0 before:h-[3px] before:rounded-b-full before:bg-primary",
  },
  // Student header links from md: underlined current item.
  top: {
    list: "flex items-stretch gap-6 self-stretch",
    link: "relative flex items-center gap-2 text-fg-muted hover:text-fg",
    current:
      "font-semibold text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-primary",
  },
};

export function NavLinks({
  role,
  variant,
  onNavigate,
}: {
  role: Role;
  variant: Variant;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const s = styles[variant];

  return (
    <ul className={s.list}>
      {navigation[role].map(({ href, label, icon: Icon }) => {
        const current = isCurrent(pathname, href);
        return (
          <li key={href} className="flex">
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
              className={cn(s.link, "w-full", current && s.current)}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Same links without the current state: Suspense fallback while the pathname is unknown. */
export function NavLinksFallback({ role, variant }: { role: Role; variant: Variant }) {
  const s = styles[variant];
  return (
    <ul className={s.list}>
      {navigation[role].map(({ href, label, icon: Icon }) => (
        <li key={href} className="flex">
          <Link href={href} className={cn(s.link, "w-full")}>
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span>{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
