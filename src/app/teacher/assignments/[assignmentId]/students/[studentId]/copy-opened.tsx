"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { CopySeen } from "@/server/data/review/copy";
import { recordCopyOpenedAction } from "./actions";

/**
 * E7 plan §1.6: once the copy is shown, logs "copy opened" and refreshes the
 * page if the copy changed since it was rendered (a page from the router's
 * cache, a replacement). In an effect, never while rendering: a prefetch
 * mounts nothing. Runs again when the page is shown again (the browser's
 * back button), not when a refresh renders it again; React's double mount in
 * development is absorbed by the timer the cleanup cancels.
 */
export function CopyOpened({ seen }: { seen: CopySeen }) {
  const router = useRouter();
  const seenRef = useRef(seen);
  useEffect(() => {
    seenRef.current = seen;
  }, [seen]);

  const { submissionId } = seen;
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      recordCopyOpenedAction(seenRef.current)
        .then(({ refresh }) => {
          if (refresh && active) router.refresh();
        })
        // Opening never fails for the teacher: the copy is already shown.
        .catch(() => {});
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [submissionId, router]);

  return null;
}
