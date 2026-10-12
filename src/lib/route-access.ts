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
