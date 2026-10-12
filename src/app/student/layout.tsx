import { StudentShell } from "@/components/shell/student-shell";

export default function Layout({ children }: LayoutProps<"/student">) {
  return <StudentShell>{children}</StudentShell>;
}
