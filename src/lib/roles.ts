// Kept free of UI imports: next.config.ts reads it for the role redirects.

export type Role = "teacher" | "student" | "admin";

/** Landing page of each role space; /teacher, /student and /admin redirect here. */
export const roleHome: Record<Role, string> = {
  teacher: "/teacher/classes",
  student: "/student/assignments",
  admin: "/admin/teachers",
};
