import type { ReactNode } from "react";
import { MobileDrawer } from "./mobile-drawer";
import { roleHome, type Role } from "./navigation";
import { PrimaryNav } from "./primary-nav";
import { Account } from "./account";
import { Brand } from "./shell-parts";

/**
 * Teacher and student spaces share one layout: fixed 200 px sidebar from lg,
 * a drawer opened from the header below lg.
 */
export function SidebarShell({
  role,
  roleLabel,
  children,
}: {
  role: Exclude<Role, "admin">;
  roleLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1">
      <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col border-r border-border-subtle bg-surface lg:flex">
        <div className="flex h-header items-center border-b border-border-subtle px-4">
          <Brand href={roleHome[role]} />
        </div>
        <PrimaryNav role={role} variant="sidebar" label="Main" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-header items-center gap-3 border-b border-border-subtle bg-surface px-4 md:px-6">
          <MobileDrawer role={role} label="Main" />
          <div className="lg:hidden">
            <Brand href={roleHome[role]} />
          </div>
          <div className="ml-auto">
            <Account role={role} roleLabel={roleLabel} />
          </div>
        </header>
        <main className="page-container flex-1">{children}</main>
      </div>
    </div>
  );
}
