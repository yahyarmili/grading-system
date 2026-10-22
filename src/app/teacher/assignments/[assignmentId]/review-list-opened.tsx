"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { recordListOpenedAction } from "./actions";

/**
 * E7 plan §1.6, §1.7: once the list is shown, logs "list opened" and sweeps
 * the evaluations after answering (the action no longer waits for the sweep,
 * C8c: what it changes here, a copy received or evaluating, is shown by
 * RefreshWhileEvaluating). In an effect, never while rendering: a prefetch mounts
 * nothing. Runs again when the page is shown again (the browser's back
 * button), not when a filter or a refresh renders it again. React's double
 * mount in development is absorbed by the timer the cleanup cancels.
 */
export function ReviewListOpened({ assignmentId, stamp }: { assignmentId: string; stamp: string }) {
  const router = useRouter();
  // The latest stamp, read when the effect fires: it must not run the effect again.
  const stampRef = useRef(stamp);
  useEffect(() => {
    stampRef.current = stamp;
  }, [stamp]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      recordListOpenedAction(assignmentId, stampRef.current)
        .then(({ refresh }) => {
          // Shown from the router's cache, or changed meanwhile: the list is read again.
          if (refresh && active) router.refresh();
        })
        // Opening never fails for the teacher: the list is already shown.
        .catch(() => {});
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [assignmentId, router]);

  return null;
}
