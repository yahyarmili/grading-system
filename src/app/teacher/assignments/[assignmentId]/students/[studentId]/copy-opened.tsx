"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { CopySeen } from "@/server/data/review/copy";
import { recordCopyOpenedAction } from "./actions";
import { useCopyState } from "./copy-state";

/**
 * E7 plan §1.6: once the copy is shown, logs "copy opened" and refreshes the
 * page if the copy changed since it was rendered (a page from the router's
 * cache, a replacement). In an effect, never while rendering: a prefetch
 * mounts nothing. Runs again when the page is shown again (the browser's
 * back button, a page kept by the router), not when a refresh renders it
 * again; React's double mount in development is absorbed by the timer the
 * cleanup cancels. The revision compared is the newest the page knows: one
 * saved since the rendering is not a change. With changes typed in the form,
 * nothing is refreshed: the form asks the teacher (REV-03 CA4).
 */
export function CopyOpened({ seen }: { seen: CopySeen }) {
  const router = useRouter();
  const { read, setStale } = useCopyState();
  const seenRef = useRef(seen);
  useEffect(() => {
    seenRef.current = seen;
  }, [seen]);

  const { submissionId } = seen;
  useEffect(() => {
    let active = true;
    // After the form's own effects of this showing: it has reported what it holds.
    const timer = setTimeout(() => {
      const known = { ...seenRef.current, revision: Math.max(seenRef.current.revision, read().revision ?? 0) };
      recordCopyOpenedAction(known)
        .then(({ refresh }) => {
          if (!refresh || !active) return;
          if (read().dirty) setStale(true);
          else router.refresh();
        })
        // Opening never fails for the teacher: the copy is already shown.
        .catch(() => {});
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [submissionId, router, read, setStale]);

  return null;
}
