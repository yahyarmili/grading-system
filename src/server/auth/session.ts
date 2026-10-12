import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Actor } from "@/server/access/actor";
import { auth } from "@/server/data/auth/better-auth";
import type { Role } from "@/lib/roles";

export type CurrentUser = { userId: string; role: Role; name: string };

/**
 * The session of the current request, read in the database on every request
 * (no cookie cache): a signed-out or expired session is gone at once.
 * Not "use cache: private": a cached copy would outlive the sign-out.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user as typeof session.user & { role: Role };
  return { userId: user.id, role: user.role, name: user.name };
});

/** The actor of the current request, for the data access layer. */
export async function getActor(): Promise<Actor> {
  const user = await getCurrentUser();
  return user ? { kind: "user", userId: user.userId, role: user.role } : { kind: "visitor" };
}

/**
 * Role space guard: a visitor goes to sign-in; another role gets "not found",
 * the same answer as a page that does not exist (AUTH-04 R3).
 * Second line behind src/proxy.ts; data access still checks the actor.
 */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.role !== role) notFound();
  return user;
}

/** Client address for attempt limits; "unknown" when no proxy header is set. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
