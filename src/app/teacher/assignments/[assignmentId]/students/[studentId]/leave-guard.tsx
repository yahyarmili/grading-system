"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * How long the browser's own question stays off once the teacher chose to
 * leave: the time for a link that unloads the page to ask it (at once in
 * Chromium, from the next task in Firefox). A link that unloads nothing (a
 * file served to download) finds the page guarded again after it.
 */
const LEAVING_MS = 1_000;

/** A link held: the element, and where it goes (path, query, hash: same origin). */
type Held = { link: HTMLAnchorElement; path: string };

/**
 * A change typed and not saved is not lost without a warning (REV-03 CA4).
 * Closing or reloading the tab, or an address typed: the browser's own
 * question (beforeunload). A link of the page, any of them (the back link,
 * the header's navigation, the mobile drawer's): the click is held, in the
 * capture phase on window, before Next's <Link> or the drawer sees it, and
 * the teacher chooses; leaving clicks the same link again, so it behaves as
 * it would have (the drawer closes, <Link> navigates in the app, a plain link
 * loads the page), without the browser asking a second time. A link opened
 * in a new tab, a download or another site's link is left alone (the latter
 * unloads the page: beforeunload asks). The browser's back and forward
 * buttons cannot be held by Next 16 (Link's onNavigate covers clicks only);
 * the router keeps the page and its form (<Activity>), an opening that finds
 * the copy changed never replaces typed changes (CopyOpened), and a page
 * rendered fresh gets them back from the tab (unsaved-draft.ts).
 */
export function LeaveGuard({ active }: { active: boolean }) {
  const router = useRouter();
  const [held, setHeld] = useState<Held | null>(null);
  const passing = useRef(false);
  /** The teacher chose to leave: the browser does not ask again. */
  const leaving = useRef(false);

  useEffect(() => {
    if (!active) return;
    // Guarded again whenever the page is shown with changes (a page kept by the router, shown again).
    leaving.current = false;
    const warn = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    // The page restored by the browser's own cache after a link that unloaded it: guarded again.
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) leaving.current = false;
    };
    const hold = (event: MouseEvent) => {
      if (passing.current || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;
      const to = new URL(link.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      // The same page (an anchor): nothing is left.
      if (to.pathname === window.location.pathname && to.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setHeld({ link, path: `${to.pathname}${to.search}${to.hash}` });
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pageshow", restored);
    window.addEventListener("click", hold, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("click", hold, true);
    };
  }, [active]);

  function leave() {
    const target = held;
    setHeld(null);
    if (!target) return;
    leaving.current = true;
    window.setTimeout(() => {
      leaving.current = false;
    }, LEAVING_MS);
    // The link gone meanwhile (the page rendered again): where it went, in the
    // app, as its <Link> would have; never a choice ignored in silence.
    if (!target.link.isConnected) {
      router.push(target.path);
      return;
    }
    passing.current = true;
    try {
      target.link.click();
    } finally {
      passing.current = false;
    }
  }

  return (
    <Dialog open={held !== null} onOpenChange={(open) => !open && setHeld(null)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>
            Your changes to this evaluation are not saved. If you leave, they may be lost.
          </DialogDescription>
        </DialogHeader>
        {/* Stay first: focus starts on it, so Enter never leaves by accident. */}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Stay on this page</Button>
          </DialogClose>
          <Button variant="destructive" onClick={leave}>
            Leave without saving
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
