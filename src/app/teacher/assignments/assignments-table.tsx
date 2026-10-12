"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

export type AssignmentRow = {
  id: string;
  title: string;
  classes: string[];
  language: string;
  due: string; // ISO date
  students: number;
  submitted: number;
  toReview: number;
};

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

const columns: Column<AssignmentRow>[] = [
  {
    key: "title",
    header: "Assignment",
    cell: (a) => (
      <div className="flex flex-col">
        <Link
          href={`/teacher/assignments/${a.id}`}
          className="link-cell"
        >
          {a.title}
        </Link>
        <span className="text-xs text-fg-muted">{a.language}</span>
      </div>
    ),
    sortValue: (a) => a.title,
  },
  {
    key: "classes",
    header: "Classes",
    cell: (a) => <span className="whitespace-nowrap">{a.classes.join(", ")}</span>,
  },
  {
    key: "due",
    header: "Due",
    cell: (a) => (
      <time dateTime={a.due} className="whitespace-nowrap">
        {dateFormat.format(new Date(a.due))}
      </time>
    ),
    sortValue: (a) => a.due,
  },
  {
    key: "submitted",
    header: "Submitted",
    className: "text-right",
    cell: (a) => (
      <span className="whitespace-nowrap tabular-nums">
        {a.submitted} <span className="text-fg-muted">of {a.students}</span>
      </span>
    ),
    sortValue: (a) => a.submitted,
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

export function AssignmentsTable({ rows }: { rows: AssignmentRow[] }) {
  return (
    <DataTable
      label="Assignments"
      entityName="assignments"
      columns={columns}
      rows={rows}
      getRowKey={(a) => a.id}
      initialSort={{ key: "due", direction: "descending" }}
    />
  );
}
