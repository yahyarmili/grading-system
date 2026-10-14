"use client";

import { useState } from "react";
import { UserMinus, UserPlus, UserRoundX, Users } from "lucide-react";
import { Alert } from "@/components/alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RosterActionResult } from "@/server/classes/roster";
import type { ClassRoster, RosterStudent } from "@/server/data/classes/roster";
import { readmitStudentAction, removeStudentAction } from "../actions";

// CLS-04: the class's students, removal and readmission. Only the owner
// teacher reaches this screen (row "classRoster" of the matrix).

// Time zone not decided yet (NFR-USA-02): dates are shown in UTC.
const day = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const on = (iso: string) => day.format(new Date(iso));

const fullName = (s: RosterStudent) => `${s.firstName} ${s.lastName}`;

export function Roster({ classId, roster }: { classId: string; roster: ClassRoster }) {
  const [notice, setNotice] = useState<RosterActionResult | null>(null);

  const identity: Column<RosterStudent>[] = [
    { key: "firstName", header: "First name", sortValue: (s) => s.firstName, cell: (s) => s.firstName },
    { key: "lastName", header: "Last name", sortValue: (s) => s.lastName, cell: (s) => <span className="font-medium">{s.lastName}</span> },
    { key: "email", header: "Email", sortValue: (s) => s.email, cell: (s) => s.email, className: "whitespace-nowrap" },
  ];

  const active: Column<RosterStudent>[] = [
    ...identity,
    { key: "joined", header: "Joined", sortValue: (s) => s.joinedAt, cell: (s) => on(s.joinedAt), className: "whitespace-nowrap" },
    {
      key: "actions",
      header: "Actions",
      cell: (s) => (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              <UserMinus aria-hidden="true" />
              Remove<span className="sr-only"> {fullName(s)}</span>
            </Button>
          }
          title={`Remove ${fullName(s)} from the class?`}
          description="They no longer see the class and no longer receive its assignments. Their submissions stay visible to you. They can't join again with the link or code: only you can readmit them, from Removed students."
          confirmLabel="Remove"
          cancelLabel="Keep them"
          destructive
          onConfirm={async () => setNotice(await removeStudentAction(classId, s.studentId))}
        />
      ),
    },
  ];

  const removed: Column<RosterStudent>[] = [
    ...identity,
    {
      key: "removed",
      header: "Removed",
      sortValue: (s) => s.removedAt,
      cell: (s) => (s.removedAt ? on(s.removedAt) : "—"),
      className: "whitespace-nowrap",
    },
    {
      key: "actions",
      header: "Actions",
      cell: (s) => (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              <UserPlus aria-hidden="true" />
              Readmit<span className="sr-only"> {fullName(s)}</span>
            </Button>
          }
          title={`Readmit ${fullName(s)}?`}
          description="They are a member of the class again at once, see it in My classes and receive its next assignments. No link or code is needed."
          confirmLabel="Readmit"
          onConfirm={async () => setNotice(await readmitStudentAction(classId, s.studentId))}
        />
      ),
    },
  ];

  return (
    <section aria-labelledby="students-title" className="flex flex-col gap-3">
      <h2 id="students-title" className="text-base font-semibold">
        Students
      </h2>
      {notice && (
        <Alert tone={notice.ok ? "info" : "error"} title={notice.ok ? "Done" : "Not done"} live>
          {notice.message}
        </Alert>
      )}
      <Tabs defaultValue="active">
        <TabsList aria-label="Students">
          <TabsTrigger value="active">
            Active <span className="tabular-nums">({roster.active.length})</span>
          </TabsTrigger>
          <TabsTrigger value="removed">
            Removed <span className="tabular-nums">({roster.removed.length})</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="pt-2">
          <DataTable
            label="Active students"
            columns={active}
            rows={roster.active}
            getRowKey={(s) => s.studentId}
            initialSort={{ key: "lastName", direction: "ascending" }}
            pageSize={25}
            entityName="students"
            empty={
              <EmptyState
                icon={Users}
                title="No students yet"
                description="Share the link or code above. Students appear here as soon as they join."
              />
            }
          />
        </TabsContent>
        <TabsContent value="removed" className="pt-2">
          <DataTable
            label="Removed students"
            columns={removed}
            rows={roster.removed}
            getRowKey={(s) => s.studentId}
            initialSort={{ key: "lastName", direction: "ascending" }}
            pageSize={25}
            entityName="removed students"
            empty={
              <EmptyState
                icon={UserRoundX}
                title="No removed students"
                description="Students you remove appear here. They can't join again alone; you can readmit them."
              />
            }
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
