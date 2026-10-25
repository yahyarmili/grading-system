"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { LoadingState } from "@/components/loading";
import { FRESHNESS_GRACE_MS } from "@/config/provisional";

// PUB-01 CA3, PUB-02 R2 (E8 plan §5, E8.7 review M1 and m1): the router
// shows a page left again (back and forward) without asking the server,
// whether it kept it hidden (<Activity>) or rebuilds it from memory; the
// browser may restore a whole document from its back-forward cache. Each
// server rendering of a guarded page carries a new renderId: one never seen
// in this tab was just checked by the server; one seen already is a page
// shown again, hidden before it paints, then checked. Still as shown, it
// shows; otherwise the page renders again from the server (a 404 for a
// withdrawn result, the current states for a list). A page already read
// stays in the browser's memory: the guarantee holds at the next access, not
// on a screen left open.

/** renderId → when it was last known fresh, in this tab (module state: a reload renders anew). */
const checkedAt = new Map<string, number>();

export function FreshnessGuard({
  renderId,
  check,
  label,
  unmount = false,
  className,
  children,
}: {
  renderId: string;
  /** A Server Action bound to what the page shows: true while it still is. */
  check: () => Promise<boolean>;
  label: string;
  /** While checking, unmount the content (a result) rather than hide it (a page with a text to keep). */
  unmount?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // When this instance first rendered: a route left before its page ran any effect (not hydrated yet)
  // is rendered hidden later, without effects; shown again, its first effect is not a fresh rendering (E8.7).
  // A later rendering from the server reaches the same instance with a new renderId: fresh.
  const [first] = useState(() => ({ renderId, at: Date.now() }));
  // The render being checked: a new rendering from the server is never in check.
  const [checking, setChecking] = useState<string | null>(null);

  // Layout effects run before paint, when the page mounts and each time a hidden route is shown again.
  useLayoutEffect(() => {
    const now = Date.now();
    let last = checkedAt.get(renderId);
    if (last === undefined) {
      // Rendered just now: the server's rendering, fresh. Rendered long ago: a page shown again.
      const rendered = renderId === first.renderId ? first.at : now;
      if (now - rendered < FRESHNESS_GRACE_MS) {
        checkedAt.set(renderId, now);
        return;
      }
      last = rendered;
    }
    // React's double mount in development, not a page shown again.
    if (now - last < FRESHNESS_GRACE_MS) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidden before paint is the point
    setChecking(renderId);
    check()
      .then((fresh) => {
        if (!live) return;
        if (fresh) {
          checkedAt.set(renderId, Date.now());
          setChecking(null);
        } else {
          router.refresh();
        }
      })
      .catch(() => live && router.refresh());
    return () => {
      live = false;
    };
  }, [renderId, check, router, first]);

  // A document restored from the browser's back-forward cache runs no effect: reload it.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const hidden = checking === renderId;
  if (unmount) return hidden ? <LoadingState label={label} /> : children;
  return (
    <>
      {hidden && <LoadingState label={label} />}
      <div hidden={hidden} className={className}>
        {children}
      </div>
    </>
  );
}
