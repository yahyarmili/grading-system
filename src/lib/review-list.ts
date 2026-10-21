import { compareText } from "@/lib/collation";
import type { NotAssessableCause } from "@/lib/evaluation";
import { submissionStatuses, type SubmissionMode, type SubmissionStatus } from "@/lib/submission-status";

// REV-01: the submissions of one assignment, sorted, filtered, counted and
// cut into pages on the whole list, by the server (E7 plan §1.8). Pure, so
// the order is the one the unit tests check: the same collator everywhere
// (compareText), never a database collation.

/** One recipient class of the assignment the student belongs to; removed: CLS-04 R3. */
export type RowClass = { id: string; name: string; removed: boolean };

/** One line per student (R2, R3); "to_submit" when nothing was submitted. */
export type ReviewRow = {
  studentId: string;
  /** The submission and its active version: what a relaunch acts upon (E7.6); null when not submitted. */
  submission: { id: string; versionNumber: number } | null;
  /** E7.6: a retry or relaunch the teacher asked waits for its run. */
  requested: boolean;
  firstName: string;
  lastName: string;
  /** By name. */
  classes: RowClass[];
  status: SubmissionStatus;
  /** SUB-04: the first submission came after the deadline. */
  late: boolean;
  /** Of the active version; null when not submitted. */
  mode: SubmissionMode | null;
  /** Date of the active version (R4, SUB-04 R2); null when not submitted. */
  versionAt: string | null;
  cause: NotAssessableCause | null;
  /** The teacher's final grade, once they changed the evaluation. */
  teacherGrade: number | null;
  /** The grade of the proposal in force. */
  proposedGrade: number | null;
};

export const reviewSorts = ["name", "grade", "date"] as const;
export type ReviewSort = (typeof reviewSorts)[number];
export const sortDirections = ["asc", "desc"] as const;
export type SortDirection = (typeof sortDirections)[number];

/** A state of §5.5, or both failures at once. */
export type StatusFilter = SubmissionStatus | "failed";
export const failedStatuses: readonly SubmissionStatus[] = ["transcription_failed", "evaluation_failed"];

/** What the URL holds (?sort, dir, class, status, page): kept when going to a copy and back. */
export type ReviewListQuery = {
  sort: ReviewSort;
  dir: SortDirection;
  /** A recipient class id, or every class. */
  classId: string | null;
  status: StatusFilter | null;
  page: number;
};

export const DEFAULT_REVIEW_QUERY: ReviewListQuery = { sort: "name", dir: "asc", classId: null, status: null, page: 1 };

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const among = <T extends string>(list: readonly T[], value: string | undefined): T | undefined =>
  (list as readonly string[]).includes(value ?? "") ? (value as T) : undefined;

/**
 * Reads the list's state from the URL; anything unknown falls back to the
 * default. A class must be one of `classIds` (the assignment's own).
 */
export function parseReviewListQuery(params: SearchParams, classIds: readonly string[]): ReviewListQuery {
  const classId = one(params.class);
  const page = Number(one(params.page));
  return {
    sort: among(reviewSorts, one(params.sort)) ?? DEFAULT_REVIEW_QUERY.sort,
    dir: among(sortDirections, one(params.dir)) ?? DEFAULT_REVIEW_QUERY.dir,
    classId: classId && classIds.includes(classId) ? classId : null,
    status: among<StatusFilter>([...submissionStatuses, "failed"], one(params.status)) ?? null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The query string of a state, defaults left out: "" for the default list. */
export function reviewListSearch(query: ReviewListQuery): string {
  const params = new URLSearchParams();
  if (query.sort !== DEFAULT_REVIEW_QUERY.sort) params.set("sort", query.sort);
  if (query.dir !== DEFAULT_REVIEW_QUERY.dir) params.set("dir", query.dir);
  if (query.classId) params.set("class", query.classId);
  if (query.status) params.set("status", query.status);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** R4: the teacher's grade; otherwise the proposed one, provisional; otherwise none. */
export function gradeOf(row: ReviewRow): { value: number; provisional: boolean } | null {
  if (row.teacherGrade !== null) return { value: row.teacherGrade, provisional: false };
  if (row.proposedGrade !== null) return { value: row.proposedGrade, provisional: true };
  return null;
}

export function matchesStatus(row: ReviewRow, filter: StatusFilter | null): boolean {
  if (filter === null) return true;
  if (filter === "failed") return failedStatuses.includes(row.status);
  return row.status === filter;
}

/** Alphabetical: last name, then first name, case- and accent-insensitive (R4, CA3). */
const byName = (a: ReviewRow, b: ReviewRow) =>
  compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName) || (a.studentId < b.studentId ? -1 : 1);

const sortKey: Record<Exclude<ReviewSort, "name">, (row: ReviewRow) => number | null> = {
  grade: (row) => gradeOf(row)?.value ?? null,
  date: (row) => (row.versionAt === null ? null : Date.parse(row.versionAt)),
};

/**
 * The order of the whole list (R4, CA2): a row without a grade or a date
 * stays at the end in both directions, never counted as 0; equal values by
 * name, always ascending.
 */
export function compareRows(sort: ReviewSort, dir: SortDirection): (a: ReviewRow, b: ReviewRow) => number {
  const factor = dir === "asc" ? 1 : -1;
  if (sort === "name") return (a, b) => byName(a, b) * factor;
  const key = sortKey[sort];
  return (a, b) => {
    const va = key(a);
    const vb = key(b);
    if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
    return (va - vb) * factor || byName(a, b);
  };
}

export type ReviewCounts = { to_review: number; failed: number; not_assessable: number };

export type ArrangedList = {
  /** The rows of the page asked, in order. */
  rows: ReviewRow[];
  /** Rows the filters keep, over every page. */
  total: number;
  page: number;
  pageCount: number;
  /** R5: over the whole list, whatever the filters. */
  counts: ReviewCounts;
};

/** Filters, sorts, then cuts the page; a page past the last shows the last. */
export function arrangeReviewList(rows: readonly ReviewRow[], query: ReviewListQuery, pageSize: number): ArrangedList {
  const kept = rows
    .filter((row) => (query.classId === null || row.classes.some((c) => c.id === query.classId)) && matchesStatus(row, query.status))
    .sort(compareRows(query.sort, query.dir));
  const pageCount = Math.max(1, Math.ceil(kept.length / pageSize));
  const page = Math.min(query.page, pageCount);
  return {
    rows: kept.slice((page - 1) * pageSize, page * pageSize),
    total: kept.length,
    page,
    pageCount,
    counts: {
      to_review: rows.filter((row) => matchesStatus(row, "to_review")).length,
      failed: rows.filter((row) => matchesStatus(row, "failed")).length,
      not_assessable: rows.filter((row) => matchesStatus(row, "not_assessable")).length,
    },
  };
}
