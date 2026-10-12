import type { ReactNode } from "react";
import { mockUsers } from "@/mock/data";
import { roleHome } from "./navigation";
import { PrimaryNav } from "./primary-nav";
import { Brand, UserBadge } from "./shell-parts";

/**
 * Student space, phone first (portrait): a bottom tab bar within thumb reach,
 * moved into the header from md. Content is a single narrow column.
 */
export function StudentShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-6 px-4 md:h-header">
          <Brand href={roleHome.student} />
          <PrimaryNav
            role="student"
            variant="top"
            label="Main"
            className="hidden self-stretch md:flex"
          />
          <div className="ml-auto">
            <UserBadge user={mockUsers.student} roleLabel="Student" />
          </div>
        </div>
      </header>

      {/* Bottom padding keeps the last item clear of the tab bar on phones. */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-24 md:pt-6 md:pb-8">
        {children}
      </main>

      <PrimaryNav
        role="student"
        variant="bottom"
        label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      />
    </div>
  );
}
