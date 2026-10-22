"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

// What the form and the opening of the copy (CopyOpened) share, so that a
// page shown again never replaces changes the teacher typed (REV-03 CA4):
// whether the form holds changes not saved, the revision it last saved or
// took, and whether an opening found the copy changed while the form held
// changes.

type FormReport = {
  /** The form holds changes not saved; false without a form. */
  dirty: boolean;
  /** The revision the form last saved or took; null without a form. */
  revision: number | null;
};

type CopyState = {
  /** Called by the form on each change, and with no form once it is gone or hidden. */
  report: (form: FormReport) => void;
  /** What the form last reported, read when needed (never while rendering). */
  read: () => FormReport;
  /** An opening found the copy changed while the form held changes: the form asks the teacher. */
  stale: boolean;
  setStale: (stale: boolean) => void;
};

export const NO_FORM: FormReport = { dirty: false, revision: null };

const Context = createContext<CopyState | null>(null);

export function CopyStateProvider({ children }: { children: ReactNode }) {
  const form = useRef<FormReport>(NO_FORM);
  const [stale, setStale] = useState(false);
  const report = useCallback((next: FormReport) => {
    form.current = next;
  }, []);
  const read = useCallback(() => form.current, []);
  const value = useMemo(() => ({ report, read, stale, setStale }), [report, read, stale]);
  return <Context value={value}>{children}</Context>;
}

export function useCopyState(): CopyState {
  const state = useContext(Context);
  if (!state) throw new Error("useCopyState outside CopyStateProvider");
  return state;
}
