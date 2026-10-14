"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { languageLabels } from "@/lib/assignment";
import { formatDateTime, TIME_ZONE_NAME } from "@/lib/dates";
import type { TeacherAssignmentItem } from "@/server/data/assignments/assignments";

// ASG-02 R1: one row per assignment of the teacher.

const columns: Column<TeacherAssignmentItem>[] = [
  {
    key: "title",
    header: "Assignment",
    cell: (a) => (
      <Link href={`/teacher/assignments/${a.id}`} className="link-cell">
        {a.title}
      </Link>
    ),
    sortValue: (a) => a.title,
  },
  {
    key: "language",
    header: "Language",
    cell: (a) => languageLabels[a.language],
    sortValue: (a) => languageLabels[a.language],
  },
  {
    key: "level",
    header: "Level",
    cell: (a) => a.level,
    sortValue: (a) => a.level,
  },
  {
    key: "classes",
    header: "Classes",
    cell: (a) => a.classes.join(", "),
  },
  {
    key: "deadline",
    // The zone is named once, in the header.
    header: `Deadline (${TIME_ZONE_NAME})`,
    cell: (a) => (
      <time dateTime={a.deadline} className="whitespace-nowrap">
        {formatDateTime(a.deadline, { zone: false })}
      </time>
    ),
    sortValue: (a) => a.deadline,
  },
  {
    key: "submissions",
    header: "Submissions",
    className: "text-right",
    cell: (a) => <span className="tabular-nums">{a.submissions}</span>,
    sortValue: (a) => a.submissions,
  },
  {
    key: "toReview",
    header: "To review",
    className: "text-right",
    cell: (a) =>
      a.toReview > 0 ? (
        <span className="font-semibold tabular-nums">{a.toReview}</span>
      ) : (
        <span className="text-fg-muted tabular-nums">0</span>
      ),
    sortValue: (a) => a.toReview,
  },
];

export function AssignmentsTable({ rows }: { rows: TeacherAssignmentItem[] }) {
  return (
    <DataTable
      label="Assignments"
      entityName="assignments"
      columns={columns}
      rows={rows}
      getRowKey={(a) => a.id}
      // R2: latest deadline first.
      initialSort={{ key: "deadline", direction: "descending" }}
    />
  );
}
