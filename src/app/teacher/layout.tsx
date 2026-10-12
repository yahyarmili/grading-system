import { TeacherShell } from "@/components/shell/teacher-shell";

export default function Layout({ children }: LayoutProps<"/teacher">) {
  return <TeacherShell>{children}</TeacherShell>;
}
