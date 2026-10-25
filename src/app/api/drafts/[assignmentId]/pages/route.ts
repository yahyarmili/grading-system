import { PAGE_UPLOAD_MAX_BYTES } from "@/config/provisional";
import { getActor } from "@/server/auth/session";
import { uploadDraftPage } from "@/server/submissions/images";

// SUB-03 (E9, spec 0011): one page of the student's draft, a raw JPEG body
// already shrunk by the browser. Headers: x-upload-request-id (a retry stores
// one page), x-page-position, x-replaces-page-id (a retake). The checks are
// the service's (images.ts); this route only reads the body within its bound.

/** The body, or null as soon as it grows past the bound: never read whole into memory beyond it. */
async function readBounded(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > PAGE_UPLOAD_MAX_BYTES) return null;
  if (!request.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > PAGE_UPLOAD_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(request: Request, ctx: RouteContext<"/api/drafts/[assignmentId]/pages">) {
  const { assignmentId } = await ctx.params;
  const actor = await getActor();
  // A visitor learns nothing of the body's bound: the same 404 as any refusal.
  if (actor.kind === "visitor") return new Response(null, { status: 404 });
  const body = await readBounded(request);
  if (!body) return Response.json({ reason: "tooLarge" }, { status: 413 });
  const answer = await uploadDraftPage(
    actor,
    assignmentId,
    {
      uploadRequestId: request.headers.get("x-upload-request-id"),
      position: request.headers.get("x-page-position"),
      replacesPageId: request.headers.get("x-replaces-page-id"),
    },
    body,
  );
  return answer.body === null ? new Response(null, { status: answer.status }) : Response.json(answer.body, { status: answer.status });
}
