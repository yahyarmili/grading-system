"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Ban, ClipboardCheck, FileText, Image as ImageIcon, RotateCw, TriangleAlert, UserMinus } from "lucide-react";
import { cn } from "cn";
import { Alert } from "@/components/alert";
import { DataTable, type Column } from "@/components/data-table";
import { LateTag, StatusTag } from "@/components/status-tag";
import { Tag } from "@/components/tag";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compareText } from "@/lib/collation";
import { formatGrade } from "@/lib/grade";
import {
  statusLabels,
  submissionStatuses,
  type SubmissionStatus,
} from "@/lib/submission-status";
import type { SubmissionRow } from "@/mock/assignment-submissions";

type StatusFilter = SubmissionStatus | "failed" | "all";

const failed: SubmissionStatus[] = ["transcription_failed", "evaluation_failed"];

function matchesStatus(row: SubmissionRow, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "failed") return failed.includes(row.status);
  return row.status === filter;
}

/** Teacher grade first; otherwise the proposed grade, marked provisional (REV-01 R4). */
function sortGrade(row: SubmissionRow) {
  return row.teacherGrade ?? row.proposedGrade ?? null;
}

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export function SubmissionsList({
  assignmentId,
  rows,
  classes,
}: {
  assignmentId: string;
  rows: SubmissionRow[];
  classes: string[];
}) {
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (classFilter === "all" || r.classes.includes(classFilter)) &&
          matchesStatus(r, statusFilter),
      ),
    [rows, classFilter, statusFilter],
  );

  // Counters always count the whole list, whatever the filters.
  const counters = [
    { filter: "to_review" as const, label: "To review", icon: ClipboardCheck, tone: "warning" as const },
    { filter: "failed" as const, label: "Failed", icon: TriangleAlert, tone: "danger" as const },
    { filter: "not_assessable" as const, label: "Not assessable", icon: Ban, tone: "warning" as const },
  ].map((c) => ({ ...c, count: rows.filter((r) => matchesStatus(r, c.filter)).length }));

  const columns: Column<SubmissionRow>[] = [
    {
      key: "lastName",
      header: "Last name",
      // REV-02: a click on the name opens the copy. The first name is in the
      // accessible name so homonyms ("Martin") stay distinct.
      cell: (r) => (
        <Link
          href={`/teacher/assignments/${assignmentId}/students/${r.id}`}
          className="link font-medium whitespace-nowrap"
        >
          {r.lastName}
          <span className="sr-only"> {r.firstName}</span>
        </Link>
      ),
      sortValue: (r) => r.lastName,
      // Alphabetical: last name, then first name; case- and accent-insensitive.
      compare: (a, b) => compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName),
    },
    {
      key: "firstName",
      header: "First name",
      cell: (r) => <span className="whitespace-nowrap">{r.firstName}</span>,
    },
    {
      key: "classes",
      header: "Class",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="whitespace-nowrap">{r.classes.join(", ")}</span>
          {r.removedFromClass && (
            <Tag icon={UserMinus}>Removed from class</Tag>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <div className="flex flex-wrap gap-1">
            <StatusTag status={r.status} />
            {r.late && <LateTag />}
          </div>
          {r.cause && <span className="text-xs text-fg-muted">{r.cause}</span>}
        </div>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      cell: (r) =>
        r.mode === null ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {r.mode === "text" ? (
              <FileText aria-hidden="true" className="size-4 text-fg-muted" />
            ) : (
              <ImageIcon aria-hidden="true" className="size-4 text-fg-muted" />
            )}
            {r.mode === "text" ? "Text" : "Image"}
          </span>
        ),
    },
    {
      key: "submitted",
      header: "Submitted",
      cell: (r) =>
        r.submittedAt ? (
          <time dateTime={r.submittedAt} className="whitespace-nowrap">
            {dateFormat.format(new Date(r.submittedAt))}
          </time>
        ) : (
          <span className="text-fg-muted">
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not submitted</span>
          </span>
        ),
      sortValue: (r) => r.submittedAt,
    },
    {
      key: "grade",
      header: "Grade",
      className: "text-right",
      cell: (r) => {
        if (r.teacherGrade !== null)
          return <span className="font-medium whitespace-nowrap tabular-nums">{formatGrade(r.teacherGrade)}</span>;
        if (r.proposedGrade !== null)
          return (
            <span className="inline-flex flex-col items-end gap-0.5">
              <span className="whitespace-nowrap text-fg-muted tabular-nums">{formatGrade(r.proposedGrade)}</span>
              <span className="text-xs text-fg-muted italic">provisional</span>
            </span>
          );
        return (
          <span className="text-fg-muted">
            <span aria-hidden="true">—</span>
            <span className="sr-only">No grade</span>
          </span>
        );
      },
      sortValue: sortGrade,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (r) =>
        failed.includes(r.status) ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              setMessage(`Retry requested for ${r.firstName} ${r.lastName} (mockup: nothing is sent).`)
            }
          >
            <RotateCw aria-hidden="true" className="size-4" />
            Retry
          </button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-3" aria-label="Counters">
        {counters.map(({ filter, label, icon: Icon, tone, count }) => {
          const active = statusFilter === filter;
          return (
            <li key={filter}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(active ? "all" : filter)}
                className={cn(
                  "card flex min-w-36 items-center gap-3 px-4 py-3 text-left hover:border-primary-hover",
                  active && "ring-2 ring-primary",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("size-5", tone === "danger" ? "text-danger-fg" : "text-warning-fg")}
                />
                <span className="flex flex-col">
                  <span className="text-xl leading-tight font-semibold tabular-nums">{count}</span>
                  <span className="text-fg-muted">{label}</span>
                </span>
                <span className="sr-only">{active ? ", filter on" : ", show only these"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {message && (
        <Alert tone="info" title="Retry" live action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        }>
          {message}
        </Alert>
      )}

      <DataTable
        label="Submissions"
        entityName="students"
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.id}
        initialSort={{ key: "lastName", direction: "ascending" }}
        pageSize={20}
        toolbar={
          <>
            <div className="field w-full sm:w-52">
              <span className="label" id="filter-class-label">
                Class
              </span>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger aria-labelledby="filter-class-label" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="field w-full sm:w-60">
              <span className="label" id="filter-status-label">
                Status
              </span>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger aria-labelledby="filter-status-label" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="failed">Failed (any)</SelectItem>
                  <SelectSeparator />
                  {submissionStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(classFilter !== "all" || statusFilter !== "all") && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setClassFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </>
        }
      />
    </div>
  );
}
