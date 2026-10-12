import "server-only";
import { headers } from "next/headers";
import type { Actor } from "@/server/access/actor";
import { auth } from "@/server/data/auth/better-auth";
import type { Role } from "@/lib/roles";

/** The actor of the current request, from the session stored in the database. */
export async function getActor(): Promise<Actor> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { kind: "visitor" };
  return { kind: "user", userId: session.user.id, role: session.user.role as Role };
}

/** Client address for attempt limits; "unknown" when no proxy header is set. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
