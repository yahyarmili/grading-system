"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Alert } from "@/components/alert";

// Why an action on a copy was refused (REV-03 R5, PRC-02), kept above the
// list or the copy after the page reloaded it. The form or the button is
// then a new one, or gone: the message cannot live in it.

type Notice = { title: string; message: string };

const ShowNotice = createContext<(notice: Notice) => void>(() => {});

/** The area of a refused action's message, which stays across the reload. */
export function NoticeArea({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  return (
    <ShowNotice value={setNotice}>
      {notice && (
        <Alert
          tone="warning"
          title={notice.title}
          live
          className="mb-4"
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          }
        >
          {notice.message}
        </Alert>
      )}
      {children}
    </ShowNotice>
  );
}

export const useNotice = () => useContext(ShowNotice);
