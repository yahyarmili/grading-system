import {
  BookOpen,
  ClipboardList,
  ListChecks,
  School,
  Users,
  type LucideIcon,
} from "lucide-react";
import { roleHome, type Role } from "@/lib/roles";

export { roleHome, type Role };

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const navigation: Record<Role, NavItem[]> = {
  teacher: [
    { href: "/teacher/classes", label: "Classes", icon: School },
    { href: "/teacher/assignments", label: "Assignments", icon: ClipboardList },
    { href: "/teacher/rubric", label: "Rubric", icon: ListChecks },
  ],
  student: [
    { href: "/student/assignments", label: "My assignments", icon: ClipboardList },
    { href: "/student/classes", label: "My classes", icon: BookOpen },
    { href: "/student/rubric", label: "Rubric", icon: ListChecks },
  ],
  admin: [{ href: "/admin/teachers", label: "Teachers", icon: Users }],
};

/** A link is current on its own page and on any page below it. */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
