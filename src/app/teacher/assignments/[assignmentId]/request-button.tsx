"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "cn";
import { Spinner } from "@/components/loading";
import { relaunchEvaluationAction, retryEvaluationAction } from "./actions";
import { useNotice } from "./notice";

// PRC-02 from the screen (E7.6): "Retry" on a failed copy, "Relaunch" on a
// copy listRelaunchable offers, on the version the page shows. A refusal
// ("replaced", no longer failed or relaunchable) is said above the list or
// the copy, then the page is reloaded; a request shows there as waiting.

const actions = { retry: retryEvaluationAction, relaunch: relaunchEvaluationAction };

export function RequestButton({
  kind,
  seen,
  label,
  primary = false,
  small = false,
  context,
  describedBy,
}: {
  kind: "retry" | "relaunch";
  seen: { submissionId: string; versionNumber: number };
  /** Visible text. */
  label: string;
  primary?: boolean;
  small?: boolean;
  /** Read after the label by screen readers only: whose copy, in the list. */
  context?: string;
  /** The id of a warning that goes with the button (a refusal usually repeats). */
  describedBy?: string;
}) {
  const router = useRouter();
  const showNotice = useNotice();
  const [pending, startTransition] = useTransition();
  // R4: a second click before React disabled the button sends nothing.
  const sending = useRef(false);

  const send = () => {
    if (sending.current) return;
    sending.current = true;
    startTransition(async () => {
      try {
        const state = await actions[kind]({ submissionId: seen.submissionId, versionNumber: seen.versionNumber });
        if (state.status !== "requested") {
          showNotice({ title: kind === "retry" ? "Retry not requested" : "Relaunch not requested", message: state.message });
        }
        router.refresh();
      } catch {
        showNotice({ title: "Not requested", message: "The request could not be sent. Check your connection, then try again." });
      } finally {
        sending.current = false;
      }
    });
  };

  return (
    <button
      type="button"
      className={cn("btn", primary ? "btn-primary" : "btn-secondary", small && "btn-sm")}
      onClick={send}
      disabled={pending}
      aria-describedby={describedBy}
    >
      {pending ? <Spinner /> : <RotateCcw aria-hidden="true" className="size-4" />}
      {label}
      {context && <span className="sr-only"> {context}</span>}
    </button>
  );
}
