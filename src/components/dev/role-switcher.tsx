"use client";

// TEMPORARY (development only): jump between role spaces before authentication.
// Remove in E1, when the session decides the space.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { roleHome, type Role } from "@/components/shell/navigation";

const roles: { role: Role; label: string }[] = [
  { role: "teacher", label: "Teacher" },
  { role: "student", label: "Student" },
  { role: "admin", label: "Admin" },
];

export function RoleSwitcher() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Development role switcher"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning-border bg-warning-bg px-4 py-1 text-xs text-warning-fg"
    >
      <span className="font-semibold">Dev only · View as:</span>
      <ul className="flex gap-1">
        {roles.map(({ role, label }) => {
          const current = pathname.startsWith(`/${role}`);
          return (
            <li key={role}>
              <Link
                href={roleHome[role]}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-7 items-center rounded-sm px-2",
                  current
                    ? "bg-warning-fg font-semibold text-surface"
                    : "underline underline-offset-2",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/dev/design" className="ml-auto underline underline-offset-2">
        Design system
      </Link>
    </nav>
  );
}
