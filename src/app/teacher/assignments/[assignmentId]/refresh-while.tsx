"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EVALUATION_REFRESH_MAX_MS, EVALUATION_REFRESH_MS } from "@/config/provisional";

/**
 * E7.6: while a copy is evaluated or a request waits for its run, the page
 * renders again every EVALUATION_REFRESH_MS, EVALUATION_REFRESH_MAX_MS at
 * most: a retried copy shows "To review" without a reload. Mounted only in
 * that case; a render logs nothing (CopyOpened runs once per showing). It
 * also shows what the sweep of the opening, run after its answer, did to
 * such a copy (C8c). Each refresh renders the whole page: the list reads
 * relaunchConditions only when a line may be relaunched (C8b).
 */
export function RefreshWhileEvaluating() {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > EVALUATION_REFRESH_MAX_MS) clearInterval(timer);
      else router.refresh();
    }, EVALUATION_REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
