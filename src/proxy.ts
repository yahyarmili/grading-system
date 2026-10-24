import { NextResponse, type NextRequest } from "next/server";
import type { Role } from "@/lib/roles";
import { decideRoute, resourceRoute } from "@/lib/route-access";
import type { Actor } from "@/server/access/actor";
import { auth } from "@/server/data/auth/better-auth";
import { resourceFound } from "@/server/routes/resources";

// Role spaces: the session is checked in the database before any page of the
// space renders (Node.js runtime). A layout cannot do it: it does not stop its
// child pages from rendering. Server Actions and data access check again.
// E8.6: a page that shows one resource by its ids is checked here too, through
// the page's own readers: in production the prerendered shell's 200 is sent
// before the page runs, so only this check gives an absent resource its 404.

export async function proxy(request: NextRequest) {
  // TEMPORARY (E8.6, measurement of the resource check): Server-Timing, removed once measured.
  const started = performance.now();
  const session = await auth.api.getSession({ headers: request.headers });
  const sessionMs = performance.now() - started;
  const role = (session?.user as { role?: Role } | undefined)?.role ?? null;
  const decision = decideRoute(request.nextUrl.pathname, role);
  const timed = (response: NextResponse, resourceMs = 0) =>
    withTiming(noStore(response), { proxy: performance.now() - started, session: sessionMs, resource: resourceMs });

  if (decision === "sign-in") {
    return timed(NextResponse.redirect(new URL("/sign-in", request.url)));
  }
  // Pages only: a Server Action posts to its page's path and checks its own access;
  // rewritten, it would no longer be found (the result's freshness check, once withdrawn).
  const isPage = request.method === "GET" || request.method === "HEAD";
  const checked = performance.now();
  const missing =
    decision === "allow" && isPage && session && role
      ? await resourceMissing(request.nextUrl.pathname, { kind: "user", userId: session.user.id, role })
      : false;
  const resourceMs = performance.now() - checked;
  if (decision === "not-found" || missing) {
    // No page lives at this path, or nothing for this person: Next.js answers with its 404 page and status.
    return timed(NextResponse.rewrite(new URL("/not-found", request.url)), resourceMs);
  }
  return timed(NextResponse.next(), resourceMs);
}

/** TEMPORARY (E8.6): the proxy's durations, in milliseconds, for the measurement. */
function withTiming(response: NextResponse, durations: Record<string, number>): NextResponse {
  response.headers.set("Server-Timing", Object.entries(durations).map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`).join(", "));
  return response;
}

/**
 * The resource of this path is absent for the actor (AUTH-04 R3). When the
 * check fails (the database, say), the page decides: it reads the same
 * resource again, and answers not found with the shell's 200, never more.
 */
async function resourceMissing(pathname: string, actor: Actor): Promise<boolean> {
  const route = resourceRoute(pathname);
  if (route === null) return false;
  if (route === "malformed") return true;
  try {
    return !(await resourceFound(actor, route));
  } catch {
    return false;
  }
}

/**
 * Protected pages are never stored by the browser: after sign-out, the back
 * button asks the server again and gets the sign-in page (AUTH-02 R4).
 */
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export const config = {
  matcher: ["/student/:path*", "/teacher/:path*", "/admin/:path*"],
};
