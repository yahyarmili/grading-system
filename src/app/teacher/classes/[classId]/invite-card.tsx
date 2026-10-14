"use client";

import { useState } from "react";
import { Ban, CircleCheck, RefreshCw, TimerOff, type LucideIcon } from "lucide-react";
import { Alert } from "@/components/alert";
import { Card } from "@/components/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { Tag, type Tone } from "@/components/tag";
import { Button } from "@/components/ui/button";
import type { InviteActionResult } from "@/server/classes/invites";
import type { ClassInvite, InviteState } from "@/server/data/classes/invites";
import { disableInviteAction, renewInviteAction } from "../actions";

// CLS-02: the class link and code, with one-click copy, disabling and renewal.

const states: Record<InviteState, { label: string; tone: Tone; icon: LucideIcon }> = {
  active: { label: "Active", tone: "success", icon: CircleCheck },
  disabled: { label: "Disabled", tone: "neutral", icon: Ban },
  expired: { label: "Expired", tone: "warning", icon: TimerOff },
};

export function InviteCard({ classId, invite, validity }: { classId: string; invite: ClassInvite; validity: string }) {
  const [notice, setNotice] = useState<InviteActionResult | null>(null);
  const state = states[invite.state];
  const active = invite.state === "active" && invite.link && invite.code;

  return (
    <Card
      title="Invite students"
      description="Whoever opens the link or enters the code joins the class at once, without approval. Share them with your students only."
      actions={
        <Tag tone={state.tone} icon={state.icon}>
          <span className="sr-only">Link and code: </span>
          {state.label}
        </Tag>
      }
      footer={
        <>
          {active && (
            <ConfirmDialog
              trigger={
                <Button variant="ghost">
                  <Ban aria-hidden="true" />
                  Disable
                </Button>
              }
              title="Disable the link and code?"
              description="They stop working at once: nobody can join with them. Students already in the class stay. To invite again, generate a new link and code."
              confirmLabel="Disable"
              cancelLabel="Keep them"
              destructive
              onConfirm={async () => setNotice(await disableInviteAction(classId))}
            />
          )}
          <ConfirmDialog
            trigger={
              <Button variant={active ? "outline" : "default"}>
                <RefreshCw aria-hidden="true" />
                Generate new link and code
              </Button>
            }
            title="Generate a new link and code?"
            description={
              active
                ? "The current link and code stop working at once. Students already in the class stay. Share the new ones with students who have not joined yet."
                : "Students can join again with the new link and code. Students already in the class stay."
            }
            confirmLabel="Generate"
            onConfirm={async () => setNotice(await renewInviteAction(classId))}
          />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {notice && (
          <Alert tone={notice.ok ? "info" : "error"} title={notice.ok ? "Done" : "Not done"} live>
            {notice.message}
          </Alert>
        )}
        {active ? (
          <>
            <div className="field">
              <label className="label" htmlFor="invite-link">
                Link
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="invite-link"
                  className="input font-mono text-xs"
                  readOnly
                  value={invite.link!}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <CopyButton value={invite.link!} label="Copy link" what="Link" />
              </div>
            </div>
            <div className="field">
              <span className="label" id="invite-code-label">
                Code
              </span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <p
                  aria-labelledby="invite-code-label"
                  className="font-mono text-2xl font-semibold tracking-widest select-all"
                >
                  {invite.code}
                </p>
                <CopyButton value={invite.code!} label="Copy code" what="Code" />
              </div>
              <p className="field-hint">Students enter it in “My classes”. Letters can be typed in any case.</p>
            </div>
            <p className="text-fg-muted">{validity}</p>
          </>
        ) : (
          <p>
            {invite.state === "disabled"
              ? "The link and code are disabled: nobody can join with them."
              : "The link and code have expired: nobody can join with them."}{" "}
            Students already in the class stay. Generate a new link and code to invite students again.
          </p>
        )}
      </div>
    </Card>
  );
}
