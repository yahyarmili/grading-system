"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Ban,
  Check,
  ClipboardCheck,
  FileText,
  Image as ImageIcon,
  RotateCw,
  TriangleAlert,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
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
import { GRADE_SCALE } from "@/config/decisions";
import { compareText } from "@/lib/collation";
import { formatGradeValue } from "@/lib/grade";
import {
  statusLabels,
  submissionStatuses,
  type SubmissionStatus,
} from "@/lib/submission-status";
import type { SubmissionRow } from "@/mock/assignment-submissions";
import { formatDate } from "@/lib/dates";

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

const dateFormat = { format: formatDate };

function Missing({ label }: { label: string }) {
  return (
    <span className="text-fg-subtle">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Counter that doubles as a filter (REV-01 R5). Pressed: check icon + outline, not only color. */
function QuickFilter({
  label,
  count,
  icon: Icon,
  iconClassName,
  pressed,
  onToggle,
}: {
  label: string;
  count: number;
  icon: LucideIcon;
  iconClassName: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 transition-colors",
        pressed
          ? "border-primary bg-primary-soft font-medium"
          : "border-border bg-surface hover:border-primary-hover",
      )}
    >
      {pressed ? (
        <Check aria-hidden="true" className="size-4 text-link" />
      ) : (
        <Icon aria-hidden="true" className={cn("size-4", iconClassName)} />
      )}
      <span>{label}</span>
      <span className="min-w-5 rounded-sm bg-surface-muted px-1.5 text-center text-xs leading-5 font-semibold tabular-nums">
        {count}
      </span>
    </button>
  );
}

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
  const quickFilters = [
    { filter: "to_review" as const, label: "To review", icon: ClipboardCheck, iconClassName: "text-warning-fg" },
    { filter: "failed" as const, label: "Failed", icon: TriangleAlert, iconClassName: "text-danger-fg" },
    { filter: "not_assessable" as const, label: "Not assessable", icon: Ban, iconClassName: "text-warning-fg" },
  ].map((q) => ({ ...q, count: rows.filter((r) => matchesStatus(r, q.filter)).length }));

  const columns: Column<SubmissionRow>[] = [
    {
      key: "student",
      header: "Student",
      // REV-02: a click on the name opens the copy; last name first, as sorted.
      cell: (r) => (
        <Link href={`/dev/mockups/assignments/${assignmentId}/students/${r.id}`} className="link-cell whitespace-nowrap">
          <span className="font-semibold">{r.lastName}</span> <span className="font-normal">{r.firstName}</span>
        </Link>
      ),
      sortValue: (r) => r.lastName,
      // Alphabetical: last name, then first name; case- and accent-insensitive.
      compare: (a, b) => compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName),
    },
    {
      key: "classes",
      header: "Class",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="whitespace-nowrap">{r.classes.join(", ")}</span>
          {r.removedFromClass && <Tag icon={UserMinus}>Removed from class</Tag>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusTag status={r.status} />
          {r.cause && <span className="text-xs text-fg-muted">{r.cause}</span>}
          {failed.includes(r.status) && (
            <button
              type="button"
              className="inline-flex min-h-6 items-center gap-1 rounded-sm px-1 text-xs font-medium text-link hover:underline"
              onClick={() =>
                setMessage(`Retry requested for ${r.firstName} ${r.lastName} (mockup: nothing is sent).`)
              }
            >
              <RotateCw aria-hidden="true" className="size-3.5" />
              Retry
              <span className="sr-only"> for {r.firstName} {r.lastName}</span>
            </button>
          )}
        </div>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      cell: (r) => {
        if (r.mode === null) return <Missing label="Not submitted" />;
        const Icon = r.mode === "text" ? FileText : ImageIcon;
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Icon aria-hidden="true" className="size-4 text-fg-muted" />
            {r.mode === "text" ? "Text" : "Image"}
          </span>
        );
      },
    },
    {
      key: "submitted",
      header: "Submitted",
      cell: (r) =>
        r.submittedAt ? (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <time dateTime={r.submittedAt}>{dateFormat.format(new Date(r.submittedAt))}</time>
            {r.late && <LateTag />}
          </span>
        ) : (
          <Missing label="Not submitted" />
        ),
      sortValue: (r) => r.submittedAt,
    },
    {
      key: "grade",
      header: `Grade / ${GRADE_SCALE}`,
      className: "text-right",
      cell: (r) => {
        if (r.teacherGrade !== null)
          return <span className="font-semibold tabular-nums">{formatGradeValue(r.teacherGrade)}</span>;
        if (r.proposedGrade !== null)
          return (
            <span className="whitespace-nowrap">
              <span className="mr-1.5 text-xs text-fg-muted italic">provisional</span>
              <span className="text-fg-muted tabular-nums">{formatGradeValue(r.proposedGrade)}</span>
            </span>
          );
        return <Missing label="No grade" />;
      },
      sortValue: sortGrade,
    },
  ];

  const filtersOn = classFilter !== "all" || statusFilter !== "all";

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <Alert
          tone="info"
          title="Retry"
          live
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMessage(null)}>
              Dismiss
            </button>
          }
        >
          {message}
        </Alert>
      )}

      <DataTable
        label="Submissions"
        entityName="students"
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.id}
        initialSort={{ key: "student", direction: "ascending" }}
        // A whole class fits on one page; the sort still covers every page beyond.
        pageSize={50}
        toolbar={
          <>
            <div className="w-full sm:w-48">
              <span className="sr-only" id="filter-class-label">
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
            <div className="w-full sm:w-52">
              <span className="sr-only" id="filter-status-label">
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
            {filtersOn && (
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
            <div role="group" aria-label="Needs attention" className="flex flex-wrap gap-2 lg:ml-auto">
              {quickFilters.map((q) => (
                <QuickFilter
                  key={q.filter}
                  label={q.label}
                  count={q.count}
                  icon={q.icon}
                  iconClassName={q.iconClassName}
                  pressed={statusFilter === q.filter}
                  onToggle={() => setStatusFilter(statusFilter === q.filter ? "all" : q.filter)}
                />
              ))}
            </div>
          </>
        }
      />
    </div>
  );
}
