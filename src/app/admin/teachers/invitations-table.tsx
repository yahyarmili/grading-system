"use client";

import { useState } from "react";
import { Ban, CircleCheck, Clock, MailPlus, TimerOff, UserPlus, type LucideIcon } from "lucide-react";
import { Alert } from "@/components/alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Tag, type Tone } from "@/components/tag";
import { Button } from "@/components/ui/button";
import type { InvitationActionResult } from "@/server/auth/invitations";
import type { InvitationRow, InvitationState } from "@/server/data/auth/invitations";
import { cancelInvitationAction, reissueInvitationAction } from "./actions";

const states: Record<InvitationState, { label: string; tone: Tone; icon: LucideIcon }> = {
  pending: { label: "Waiting for the teacher", tone: "info", icon: Clock },
  expired: { label: "Link expired", tone: "warning", icon: TimerOff },
  accepted: { label: "Account active", tone: "success", icon: CircleCheck },
  cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
};

// Time zone not decided yet (NFR-USA-02): dates are shown in UTC, and say so.
const dateTime = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const at = (iso: string) => `${dateTime.format(new Date(iso))} UTC`;

function Details({ row }: { row: InvitationRow }) {
  if (row.state === "accepted" && row.acceptedAt) return <>Accepted {at(row.acceptedAt)}</>;
  if (row.state === "cancelled" && row.cancelledAt) {
    return (
      <>
        Cancelled {at(row.cancelledAt)}
        {row.cancelledBy && ` by ${row.cancelledBy}`}
      </>
    );
  }
  if (row.state === "pending" && row.expiresAt) return <>Link valid until {at(row.expiresAt)}</>;
  return <>Reissue it to send a new link</>;
}

export function InvitationsTable({ rows }: { rows: InvitationRow[] }) {
  const [notice, setNotice] = useState<InvitationActionResult | null>(null);

  async function run(action: (id: string) => Promise<InvitationActionResult>, id: string) {
    setNotice(await action(id));
  }

  const columns: Column<InvitationRow>[] = [
    {
      key: "teacher",
      header: "Teacher",
      sortValue: (r) => `${r.lastName} ${r.firstName}`,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {r.firstName} {r.lastName}
          </span>
          <span className="text-fg-muted">{r.email}</span>
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      sortValue: (r) => states[r.state].label,
      cell: (r) => {
        const s = states[r.state];
        return (
          <div className="flex flex-col items-start gap-1">
            <Tag tone={s.tone} icon={s.icon}>
              {s.label}
            </Tag>
            <span className="text-xs text-fg-muted">
              <Details row={r} />
            </span>
          </div>
        );
      },
    },
    {
      key: "sent",
      header: "Last sent",
      sortValue: (r) => r.sentAt,
      cell: (r) => (
        <div className="flex flex-col">
          <span>{at(r.sentAt)}</span>
          <span className="text-xs text-fg-muted">by {r.sentBy}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (r) =>
        r.state === "pending" || r.state === "expired" ? (
          <div className="flex flex-wrap gap-2">
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm">
                  <MailPlus aria-hidden="true" />
                  Reissue<span className="sr-only"> the invitation of {r.firstName} {r.lastName}</span>
                </Button>
              }
              title="Send a new link?"
              description={`${r.email} receives a new link. The previous link stops working.`}
              confirmLabel="Send a new link"
              onConfirm={() => run(reissueInvitationAction, r.id)}
            />
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  <Ban aria-hidden="true" />
                  Cancel<span className="sr-only"> the invitation of {r.firstName} {r.lastName}</span>
                </Button>
              }
              title="Cancel this invitation?"
              description={`The link sent to ${r.email} stops working. You can invite this email again later.`}
              confirmLabel="Cancel the invitation"
              cancelLabel="Keep it"
              destructive
              onConfirm={() => run(cancelInvitationAction, r.id)}
            />
          </div>
        ) : (
          <span className="text-fg-muted">—<span className="sr-only">No action</span></span>
        ),
    },
  ];

  return (
    <section aria-labelledby="invitations-title" className="flex flex-col gap-3">
      <h2 id="invitations-title" className="text-base font-semibold">
        Invitations <span className="font-normal text-fg-muted tabular-nums">({rows.length})</span>
      </h2>
      {notice && (
        <Alert tone={notice.ok ? "info" : "error"} title={notice.ok ? "Done" : "Not done"} live>
          {notice.message}
        </Alert>
      )}
      <DataTable
        label="Teacher invitations"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        entityName="invitations"
        empty={
          <EmptyState
            icon={UserPlus}
            title="No invitation yet"
            description="Invite a first teacher with the form above. Their account exists once they choose a password."
          />
        }
      />
    </section>
  );
}
