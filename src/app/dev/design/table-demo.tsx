"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { LateTag, StatusTag } from "@/components/status-tag";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  statusLabels,
  submissionStatuses,
  type SubmissionStatus,
} from "@/lib/submission-status";
import { mockSubmissions, type MockSubmission } from "@/mock/submissions";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

const columns: Column<MockSubmission>[] = [
  {
    key: "student",
    header: "Student",
    cell: (s) => <span className="font-medium whitespace-nowrap">{s.student}</span>,
    sortValue: (s) => s.student,
  },
  {
    key: "assignment",
    header: "Assignment",
    cell: (s) => <span className="whitespace-nowrap">{s.assignment}</span>,
    sortValue: (s) => s.assignment,
  },
  {
    key: "submitted",
    header: "Submitted",
    cell: (s) =>
      s.submittedAt ? (
        <time dateTime={s.submittedAt} className="whitespace-nowrap">
          {dateFormat.format(new Date(s.submittedAt))}
        </time>
      ) : (
        <span className="text-fg-muted">—</span>
      ),
    sortValue: (s) => s.submittedAt,
  },
  {
    key: "status",
    header: "Status",
    cell: (s) => (
      <div className="flex flex-col items-start gap-1">
        <div className="flex flex-wrap gap-1">
          <StatusTag status={s.status} />
          {s.late && <LateTag />}
        </div>
        {s.cause && <span className="text-xs text-fg-muted">{s.cause}</span>}
      </div>
    ),
    // Sort by position in the workflow, not alphabetically.
    sortValue: (s) => submissionStatuses.indexOf(s.status),
  },
];

export function TableDemo({ loading = false, empty = false }: { loading?: boolean; empty?: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [lateOnly, setLateOnly] = useState(false);

  const rows = useMemo(() => {
    if (empty) return [];
    const q = query.trim().toLowerCase();
    return mockSubmissions.filter(
      (s) =>
        (!q || s.student.toLowerCase().includes(q)) &&
        (status === "all" || s.status === status) &&
        (!lateOnly || s.late),
    );
  }, [query, status, lateOnly, empty]);

  return (
    <DataTable
      label="Submissions"
      entityName="submissions"
      columns={columns}
      rows={rows}
      getRowKey={(s) => s.id}
      initialSort={{ key: "submitted", direction: "descending" }}
      loading={loading}
      empty={
        empty ? (
          <EmptyState
            icon={Inbox}
            title="No submissions yet"
            description="Submissions appear here as soon as students hand in their work."
          />
        ) : undefined
      }
      toolbar={
        loading || empty ? undefined : (
          <>
            <div className="field w-full sm:w-56">
              <label className="label" htmlFor="filter-student">
                Student
              </label>
              <input
                id="filter-student"
                type="search"
                className="input"
                placeholder="Search by name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="field w-full sm:w-56">
              <span className="label" id="filter-status-label">
                Status
              </span>
              <Select value={status} onValueChange={(v) => setStatus(v as SubmissionStatus | "all")}>
                <SelectTrigger aria-labelledby="filter-status-label" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {submissionStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex min-h-10 items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={lateOnly}
                onChange={(e) => setLateOnly(e.target.checked)}
              />
              Late only
            </label>
          </>
        )
      }
    />
  );
}
