import type { ReactNode } from "react";
import { mockUsers } from "@/mock/data";
import { roleHome } from "./navigation";
import { Brand, UserBadge } from "./shell-parts";

/** Admin space: a single screen (Teachers), so a header without navigation. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface">
        <div className="mx-auto flex h-header max-w-5xl items-center gap-3 px-4 md:px-6">
          <Brand href={roleHome.admin} />
          <div className="ml-auto">
            <UserBadge user={mockUsers.admin} roleLabel="Administrator" />
          </div>
        </div>
      </header>
      <main className="page-container mx-auto max-w-5xl flex-1">{children}</main>
    </div>
  );
}
