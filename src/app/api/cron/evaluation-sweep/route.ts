import { createHash, timingSafeEqual } from "node:crypto";
import { sweepEvaluations } from "@/server/evaluation/sweep";
import { startEvaluation } from "@/server/evaluation/trigger";

// E6 (PRC-01 CA4, PRC-02 R1): the sweep of the automatic evaluation, called
// by Vercel's cron (vercel.json) with "Authorization: Bearer <CRON_SECRET>".
// Vercel runs crons on production deployments only: the preview relies on
// the sweep of each trigger (trigger.ts). Answers counts only.

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Whether the request carries the secret; never when CRON_SECRET is not set. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response(null, { status: 401 });
  const { released, restarted } = await sweepEvaluations(startEvaluation);
  return Response.json({ released: released.length, restarted: restarted.length });
}
