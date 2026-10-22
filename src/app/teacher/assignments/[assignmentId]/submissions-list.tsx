"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Ban, Check, CircleCheck, ClipboardCheck, FileText, Hourglass, Image as ImageIcon, TriangleAlert, UserMinus, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { DataTable, type Column, type Sort } from "@/components/data-table";
import { LateTag, StatusTag } from "@/components/status-tag";
import { Tag } from "@/components/tag";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRADE_SCALE } from "@/config/decisions";
import { formatDateTime, TIME_ZONE_NAME } from "@/lib/dates";
import { notAssessableCauseLabels } from "@/lib/evaluation";
import { formatGradeValue } from "@/lib/grade";
import {
  gradeOf,
  reviewListSearch,
  type ReviewCounts,
  type ReviewListQuery,
  type ReviewRow,
  type ReviewSort,
  type StatusFilter,
} from "@/lib/review-list";
import { statusLabels, submissionStatuses } from "@/lib/submission-status";
import { RequestButton } from "./request-button";

// REV-01: the submissions of one assignment. The state (sort, filters, page)
// lives in the URL and the server sorts the whole list (src/lib/review-list.ts):
// it survives a visit to a copy and the browser's back button.

/** Table columns sorted by the server, and the sort each one asks for. */
const sortOfColumn: Record<string, ReviewSort> = { student: "name", submitted: "date", grade: "grade" };
const columnOfSort: Record<ReviewSort, string> = { name: "student", date: "submitted", grade: "grade" };

const ALL = "all";

function Missing({ label }: { label: string }) {
  return (
    <span className="text-fg-subtle">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A counter that doubles as a filter (R5). Pressed: check icon and outline, not only a color. */
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
        "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 whitespace-nowrap transition-colors",
        pressed ? "border-primary bg-primary-soft font-medium" : "border-border bg-surface hover:border-primary-hover",
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

const quickFilters = [
  { filter: "to_review", label: "To review", icon: ClipboardCheck, iconClassName: "text-warning-fg" },
  { filter: "failed", label: "Failed", icon: TriangleAlert, iconClassName: "text-danger-fg" },
  { filter: "not_assessable", label: "Not assessable", icon: Ban, iconClassName: "text-warning-fg" },
  // E8.1: validated, not published yet.
  { filter: "validated", label: "Validated", icon: CircleCheck, iconClassName: "text-success-fg" },
] as const satisfies readonly { filter: keyof ReviewCounts; label: string; icon: LucideIcon; iconClassName: string }[];

export function SubmissionsList({
  assignmentId,
  rows,
  total,
  counts,
  query,
  classes,
  pageSize,
  relaunchable,
}: {
  assignmentId: string;
  /** The page asked, sorted and filtered by the server. */
  rows: ReviewRow[];
  total: number;
  counts: ReviewCounts;
  query: ReviewListQuery;
  classes: { id: string; name: string }[];
  pageSize: number;
  /** PRC-02 R4: the submissions listRelaunchable offers (E7.6). */
  relaunchable: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const offered = new Set(relaunchable);

  /** A new state: back to page 1 unless a page is asked; the old rows stay, dimmed, until the new ones arrive. */
  const go = (change: Partial<ReviewListQuery>) =>
    startTransition(() => router.replace(`${pathname}${reviewListSearch({ ...query, page: 1, ...change })}`, { scroll: false }));

  // The copy keeps the list's state, given back by its "Back" link (E7.3).
  const search = reviewListSearch(query).slice(1);
  const copyHref = (studentId: string) =>
    `/teacher/assignments/${assignmentId}/students/${studentId}${search ? `?list=${encodeURIComponent(search)}` : ""}`;

  const columns: Column<ReviewRow>[] = [
    {
      key: "student",
      header: "Student",
      sortable: true,
      // REV-02: the name opens the copy. Never prefetched: opening is logged
      // when the copy is shown, and a list of 100 names would cost 100 renders.
      cell: (r) => (
        <Link href={copyHref(r.studentId)} prefetch={false} className="link-cell whitespace-nowrap">
          <span className="font-semibold">{r.lastName}</span> <span className="font-normal">{r.firstName}</span>
        </Link>
      ),
    },
    {
      key: "classes",
      header: "Class",
      // CLS-04 R3: a removed student keeps their line while they have a submission.
      cell: (r) => (
        <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {r.classes.map((c, i) => (
            <li key={c.id} className="inline-flex items-center gap-2 whitespace-nowrap">
              <span>
                {c.name}
                {i < r.classes.length - 1 && ","}
              </span>
              {c.removed && <Tag icon={UserMinus}>Removed from class</Tag>}
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {r.status === "to_submit" ? <span className="text-fg-muted">Not submitted</span> : <StatusTag status={r.status} />}
          {r.cause && <span className="text-xs text-fg-muted">{notAssessableCauseLabels[r.cause]}</span>}
          {r.refused && <span className="text-xs text-fg-muted">The AI declined the text</span>}
          {r.requested ? (
            <Tag icon={Hourglass}>{r.status === "evaluation_failed" ? "Retry requested" : "Relaunch requested"}</Tag>
          ) : (
            r.submission &&
            // PRC-02 from the list (E7.8): a failure is retried here; a
            // refusal from the copy, where its warning is.
            ((r.status === "evaluation_failed" && !r.refused) || offered.has(r.submission.id)) && (
              <RequestButton
                kind={r.status === "evaluation_failed" ? "retry" : "relaunch"}
                seen={{ submissionId: r.submission.id, versionNumber: r.submission.versionNumber }}
                label={r.status === "evaluation_failed" ? "Retry" : "Relaunch"}
                small
                context={`${r.firstName} ${r.lastName}`}
              />
            )
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
            {r.mode === "text" ? "Text" : "Images"}
          </span>
        );
      },
    },
    {
      key: "submitted",
      // The active version (R4); the zone is named once, in the header.
      header: `Submitted (${TIME_ZONE_NAME})`,
      sortable: true,
      cell: (r) =>
        r.versionAt ? (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <time dateTime={r.versionAt}>{formatDateTime(r.versionAt, { zone: false })}</time>
            {r.late && <LateTag />}
          </span>
        ) : (
          <Missing label="Not submitted" />
        ),
    },
    {
      key: "grade",
      header: `Grade / ${GRADE_SCALE}`,
      sortable: true,
      className: "text-right",
      cell: (r) => {
        const grade = gradeOf(r);
        if (!grade) return <Missing label="No grade" />;
        if (!grade.provisional) return <span className="font-semibold tabular-nums">{formatGradeValue(grade.value)}</span>;
        return (
          <span className="whitespace-nowrap">
            <span className="mr-1.5 text-xs text-fg-muted italic">provisional</span>
            <span className="text-fg-muted tabular-nums">{formatGradeValue(grade.value)}</span>
          </span>
        );
      },
    },
  ];

  const filtersOn = query.classId !== null || query.status !== null;

  return (
    <DataTable
      label="Submissions"
      entityName="students"
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.studentId}
      pageSize={pageSize}
      controlled={{
        sort: { key: columnOfSort[query.sort], direction: query.dir === "asc" ? "ascending" : "descending" },
        onSortChange: (sort: Sort) => go({ sort: sortOfColumn[sort.key], dir: sort.direction === "ascending" ? "asc" : "desc" }),
        page: query.page,
        total,
        onPageChange: (page) => go({ page }),
        pending,
      }}
      toolbar={
        // One row on a wide screen, as in mockup 1.4: the selects shrink rather
        // than push the counters to a second row when "Clear filters" shows.
        <div className="flex w-full flex-wrap items-center gap-3 xl:flex-nowrap">
          <div className="w-full sm:w-48 xl:w-auto xl:max-w-48 xl:min-w-32 xl:flex-1">
            <span className="sr-only" id="filter-class-label">
              Class
            </span>
            <Select value={query.classId ?? ALL} onValueChange={(v) => go({ classId: v === ALL ? null : v })}>
              <SelectTrigger aria-labelledby="filter-class-label" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-52 xl:w-auto xl:max-w-52 xl:min-w-36 xl:flex-1">
            <span className="sr-only" id="filter-status-label">
              Status
            </span>
            <Select
              value={query.status ?? ALL}
              onValueChange={(v) => go({ status: v === ALL ? null : (v as StatusFilter) })}
            >
              <SelectTrigger aria-labelledby="filter-status-label" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="failed">Failed (any)</SelectItem>
                <SelectSeparator />
                {submissionStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "to_submit" ? "Not submitted" : statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filtersOn && (
            <button type="button" className="btn btn-ghost shrink-0" onClick={() => go({ classId: null, status: null })}>
              Clear filters
            </button>
          )}
          {/* Counted over the whole list, whatever the filters (R5). */}
          <div role="group" aria-label="Needs attention" className="flex flex-wrap gap-2 xl:ml-auto xl:shrink-0 xl:flex-nowrap">
            {quickFilters.map((q) => (
              <QuickFilter
                key={q.filter}
                label={q.label}
                count={counts[q.filter]}
                icon={q.icon}
                iconClassName={q.iconClassName}
                pressed={query.status === q.filter}
                onToggle={() => go({ status: query.status === q.filter ? null : q.filter })}
              />
            ))}
          </div>
        </div>
      }
    />
  );
}
