import { z } from "zod";
import { getActor } from "@/server/auth/session";
import { getPageImage } from "@/server/data/submissions/pages";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";

// Architecture rule 2, matrix 5.4 (E9, spec 0011): the one route that serves
// a page's JPEG, checked against the matrix at every read. No public or
// lasting link: never stored by a cache, and a 404 for anyone else, never a 403.

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, ctx: RouteContext<"/api/pages/[pageId]">) {
  const { pageId } = await ctx.params;
  if (!z.uuid().safeParse(pageId).success) return notFound();
  const actor = await getActor();
  let image: Buffer | null;
  try {
    image = await getPageImage(actor, pageId);
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return notFound();
  }
  if (!image) return notFound();
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
