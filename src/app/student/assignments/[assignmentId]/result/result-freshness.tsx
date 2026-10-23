"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/loading";
import { FRESHNESS_GRACE_MS } from "@/config/provisional";
import { checkFreshnessAction } from "./actions";

// PUB-01 CA3, E8 plan §5: the router keeps a page left (back and forward,
// <Activity hidden>); the browser may restore one from its back-forward
// cache. Neither asks the server. So a result shown again later than
// FRESHNESS_GRACE_MS after its last check is hidden before it paints, then
// checked: still published as shown, it shows; otherwise the page renders
// again from the server, a 404. The first mount was checked by the server
// rendering it. A result already read stays in the browser's memory: the
// withdrawal holds at the next access, not on a screen left open.

export function ResultFreshness({ assignmentId, token, children }: { assignmentId: string; token: string; children: React.ReactNode }) {
  const router = useRouter();
  const checkedAt = useRef<number | null>(null);
  const [checking, setChecking] = useState(false);

  // Layout effects are destroyed when the route is hidden and created again when shown, before paint.
  useLayoutEffect(() => {
    const now = Date.now();
    if (checkedAt.current === null || now - checkedAt.current < FRESHNESS_GRACE_MS) {
      checkedAt.current ??= now;
      return;
    }
    let live = true;
    setChecking(true);
    checkFreshnessAction(assignmentId, token)
      .then((fresh) => {
        if (!live) return;
        if (fresh) {
          checkedAt.current = Date.now();
          setChecking(false);
        } else {
          router.refresh();
        }
      })
      .catch(() => live && router.refresh());
    return () => {
      live = false;
    };
  }, [assignmentId, token, router]);

  // A document restored from the browser's back-forward cache runs no effect: reload it.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  if (checking) return <LoadingState label="Checking your result…" />;
  return children;
}
