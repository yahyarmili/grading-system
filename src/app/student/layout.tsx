import { SidebarShell } from "@/components/shell/sidebar-shell";

export default function Layout({ children }: LayoutProps<"/student">) {
  return (
    <SidebarShell role="student" roleLabel="Student">
      {children}
    </SidebarShell>
  );
}
