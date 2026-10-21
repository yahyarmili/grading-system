"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { recordListOpenedAction } from "./actions";

/**
 * E7 plan §1.6, §1.7: once the list is shown, sweeps the evaluations and
 * logs "list opened". In an effect, never while rendering: a prefetch mounts
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
          // Changed by the sweep, or shown from the router's cache: the list is read again.
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
