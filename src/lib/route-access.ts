import { z } from "zod";
import type { Role } from "./roles";

/** Path prefix of each role space; every page below it belongs to that role only. */
const SPACES: Record<string, Role> = { "/student": "student", "/teacher": "teacher", "/admin": "admin" };

export type RouteDecision = "public" | "allow" | "sign-in" | "not-found";

/** The role a path belongs to, or null for a public path. */
export function spaceRole(pathname: string): Role | null {
  for (const [prefix, role] of Object.entries(SPACES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return role;
  }
  return null;
}

/**
 * AUTH-04 at the route level: a visitor is sent to sign-in; another role gets
 * "not found", like a page that does not exist (R3).
 */
export function decideRoute(pathname: string, sessionRole: Role | null): RouteDecision {
  const role = spaceRole(pathname);
  if (!role) return "public";
  if (!sessionRole) return "sign-in";
  return sessionRole === role ? "allow" : "not-found";
}

/**
 * E8.6: the pages of a role space that show one resource found by the ids
 * in their path. In production the prerendered shell is sent first, with its
 * 200 (Cache Components): a page's notFound() can no longer set the status.
 * The proxy checks these resources before the page renders, and answers a
 * real 404 for an absent or another person's one (AUTH-04 R3, PUB-01 CA3).
 * Every such page is listed here (tests/route-resources.test.ts).
 */
export const RESOURCE_PAGES = [
  "/student/assignments/[assignmentId]",
  "/student/assignments/[assignmentId]/result",
  "/teacher/assignments/[assignmentId]",
  "/teacher/assignments/[assignmentId]/edit",
  "/teacher/assignments/[assignmentId]/students/[studentId]",
  "/teacher/classes/[classId]",
] as const;
export type ResourcePage = (typeof RESOURCE_PAGES)[number];

/** The other pages of the role spaces: a fixed path wins over an id, as in Next.js ("new" is no assignment id). */
export const FIXED_SPACE_PAGES = [
  "/admin/teachers",
  "/student/assignments",
  "/student/classes",
  "/student/rubric",
  "/teacher/assignments",
  "/teacher/assignments/new",
  "/teacher/classes",
  "/teacher/rubric",
] as const;

export type ResourceRoute = { page: ResourcePage; params: Record<string, string> };

const uuid = z.uuid();

/**
 * The resource page a path leads to, with its ids; "malformed" when an id is
 * not one (the page would answer not found); null for any other path.
 */
export function resourceRoute(pathname: string): ResourceRoute | "malformed" | null {
  const segments = pathname.split("/").filter(Boolean);
  if ((FIXED_SPACE_PAGES as readonly string[]).includes(`/${segments.join("/")}`)) return null;
  for (const page of RESOURCE_PAGES) {
    const pattern = page.split("/").filter(Boolean);
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const matches = pattern.every((part, i) => {
      if (!part.startsWith("[")) return part === segments[i];
      params[part.slice(1, -1)] = segments[i];
      return true;
    });
    if (!matches) continue;
    return Object.values(params).every((id) => uuid.safeParse(id).success) ? { page, params } : "malformed";
  }
  return null;
}
