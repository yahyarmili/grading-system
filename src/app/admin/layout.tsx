import { AdminShell } from "@/components/shell/admin-shell";

export default function Layout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
