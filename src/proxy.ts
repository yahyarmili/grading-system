import { NextResponse, type NextRequest } from "next/server";
import type { Role } from "@/lib/roles";
import { decideRoute } from "@/lib/route-access";
import { auth } from "@/server/data/auth/better-auth";

// Role spaces: the session is checked in the database before any page of the
// space renders (Node.js runtime). A layout cannot do it: it does not stop its
// child pages from rendering. Server Actions and data access check again.

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const role = (session?.user as { role?: Role } | undefined)?.role ?? null;
  const decision = decideRoute(request.nextUrl.pathname, role);

  if (decision === "sign-in") {
    return noStore(NextResponse.redirect(new URL("/sign-in", request.url)));
  }
  if (decision === "not-found") {
    // No page lives at this path: Next.js answers with its 404 page and status.
    return noStore(NextResponse.rewrite(new URL("/not-found", request.url)));
  }
  return noStore(NextResponse.next());
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
