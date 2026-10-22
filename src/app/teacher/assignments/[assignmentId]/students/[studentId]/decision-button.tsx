"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Send, Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Spinner } from "@/components/loading";
import type { SeenDecision } from "@/server/data/review/publication";
import { useNotice } from "../../notice";
import { publishEvaluationAction, withdrawPublicationAction } from "./actions";

// PUB-01 (E8.1): "Publish" on a Validated copy, "Withdraw publication" on a
// Published one, each after a confirmation. A refusal (not validated any
// more, changed in another tab, replaced) is said above the copy, then the
// page is reloaded; done, the page shows the new state and who did it.

const KINDS = {
  publish: {
    action: publishEvaluationAction,
    label: "Publish",
    icon: Send,
    title: "Publish this evaluation?",
    description:
      "The student will see the grade, the levels, your remarks, the general comment and the next steps. You can withdraw the publication later.",
    confirm: "Publish",
    refused: "Not published",
  },
  withdraw: {
    action: withdrawPublicationAction,
    label: "Withdraw publication",
    icon: Undo2,
    title: "Withdraw the publication?",
    description:
      "The student will no longer see this result, from their next visit. The copy stays Validated: you can publish it again.",
    confirm: "Withdraw",
    refused: "Not withdrawn",
  },
} as const;

export function DecisionButton({
  kind,
  seen,
  primary = false,
  disabled = false,
  describedBy,
}: {
  kind: keyof typeof KINDS;
  seen: SeenDecision;
  primary?: boolean;
  disabled?: boolean;
  /** The id of what explains a disabled button. */
  describedBy?: string;
}) {
  const router = useRouter();
  const showNotice = useNotice();
  const [pending, setPending] = useState(false);
  // R2: a second confirmation before the first answered sends nothing.
  const sending = useRef(false);
  const { action, label, icon: Icon, title, description, confirm, refused } = KINDS[kind];

  async function send() {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    try {
      const state = await action(seen);
      if (state.status === "refused") showNotice({ title: refused, message: state.message });
      router.refresh();
    } catch {
      showNotice({ title: refused, message: "The request could not be sent. Check your connection, then try again." });
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <ConfirmDialog
      trigger={
        <button
          type="button"
          className={primary ? "btn btn-primary" : "btn btn-secondary"}
          disabled={disabled || pending}
          aria-describedby={describedBy}
        >
          {pending ? <Spinner /> : <Icon aria-hidden="true" className="size-4" />}
          {label}
        </button>
      }
      title={title}
      description={description}
      confirmLabel={confirm}
      onConfirm={send}
    />
  );
}
