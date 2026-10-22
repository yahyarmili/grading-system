import { SidebarShell } from "@/components/shell/sidebar-shell";

export default function Layout({ children }: LayoutProps<"/teacher">) {
  return (
    <SidebarShell role="teacher" roleLabel="Teacher">
      {children}
    </SidebarShell>
  );
}
