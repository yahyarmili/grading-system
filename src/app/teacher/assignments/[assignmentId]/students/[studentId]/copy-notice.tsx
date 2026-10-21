"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Alert } from "@/components/alert";

// REV-03 R5: why a save was refused, kept above the copy after the page
// reloaded it. The form is then a new one (another version), or gone (the
// new version is being evaluated): the message cannot live in it.

const ShowNotice = createContext<(message: string) => void>(() => {});

/** The copy's area: a refused save's message stays here across the reload. */
export function CopyNoticeArea({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <ShowNotice value={setNotice}>
      {notice && (
        <Alert
          tone="warning"
          title="Not saved"
          live
          className="mb-4"
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          }
        >
          {notice}
        </Alert>
      )}
      {children}
    </ShowNotice>
  );
}

export const useCopyNotice = () => useContext(ShowNotice);
