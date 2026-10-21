import { describe, expect, it } from "vitest";
import {
  arrangeReviewList,
  DEFAULT_REVIEW_QUERY,
  gradeOf,
  parseReviewListQuery,
  reviewListSearch,
  type ReviewListQuery,
  type ReviewRow,
} from "@/lib/review-list";

// REV-01 R4, R5 (E7.2): the order, the filters and the counters of the whole
// list, before it is cut into pages.

let next = 0;
const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  studentId: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  submission: { id: "s1", versionNumber: 1 },
  requested: false,
  firstName: "Sam",
  lastName: "Doe",
  classes: [{ id: "c1", name: "Grade 10 — A", removed: false }],
  status: "to_review",
  late: false,
  mode: "text",
  versionAt: "2026-10-20T10:00:00.000Z",
  cause: null,
  teacherGrade: null,
  proposedGrade: 10,
  ...over,
});
const notSubmitted = (over: Partial<ReviewRow> = {}) =>
  row({ status: "to_submit", submission: null, mode: null, versionAt: null, proposedGrade: null, ...over });

const query = (over: Partial<ReviewListQuery> = {}): ReviewListQuery => ({ ...DEFAULT_REVIEW_QUERY, ...over });
const names = (rows: ReviewRow[]) => rows.map((r) => r.lastName);

describe("the alphabetical order (R4, CA3)", () => {
  it("ignores case, accents and the apostrophe: d'Aubigné, Émile, Eric; then the first name", () => {
    const rows = [row({ lastName: "Eric" }), row({ lastName: "émile" }), row({ lastName: "d'Aubigné" }), row({ lastName: "Martin", firstName: "Zoé" }), row({ lastName: "martin", firstName: "Alex" })];
    expect(names(arrangeReviewList(rows, query(), 50).rows)).toEqual(["d'Aubigné", "émile", "Eric", "martin", "Martin"]);
    expect(names(arrangeReviewList(rows, query({ dir: "desc" }), 50).rows)).toEqual(["Martin", "martin", "Eric", "émile", "d'Aubigné"]);
  });
});

describe("the order by grade (R4, CA2)", () => {
  it("takes the teacher's grade, otherwise the proposed one, marked provisional", () => {
    expect(gradeOf(row({ teacherGrade: 14.5, proposedGrade: 10 }))).toEqual({ value: 14.5, provisional: false });
    expect(gradeOf(row({ proposedGrade: 10 }))).toEqual({ value: 10, provisional: true });
    expect(gradeOf(row({ proposedGrade: null }))).toBeNull();
  });

  it("covers the whole list, beyond one page; no grade stays last in both directions, never as 0", () => {
    const rows = [
      row({ lastName: "A", proposedGrade: 5 }),
      notSubmitted({ lastName: "B" }),
      row({ lastName: "C", teacherGrade: 0, proposedGrade: 12 }),
      row({ lastName: "D", status: "evaluation_failed", proposedGrade: null }),
      row({ lastName: "E", proposedGrade: 18 }),
      row({ lastName: "F", teacherGrade: 13.5, proposedGrade: 8 }),
    ];
    const pages = (dir: "asc" | "desc") =>
      [1, 2, 3].flatMap((page) => names(arrangeReviewList(rows, query({ sort: "grade", dir, page }), 2).rows));
    expect(pages("asc")).toEqual(["C", "A", "F", "E", "B", "D"]);
    expect(pages("desc")).toEqual(["E", "F", "A", "C", "B", "D"]);
  });
});

describe("the order by date: the active version's (R4)", () => {
  it("sorts the submitted ones; the not submitted stay last in both directions", () => {
    const rows = [
      row({ lastName: "Late", versionAt: "2026-10-22T08:00:00.000Z" }),
      notSubmitted({ lastName: "None" }),
      row({ lastName: "Early", versionAt: "2026-10-18T08:00:00.000Z" }),
    ];
    expect(names(arrangeReviewList(rows, query({ sort: "date" }), 50).rows)).toEqual(["Early", "Late", "None"]);
    expect(names(arrangeReviewList(rows, query({ sort: "date", dir: "desc" }), 50).rows)).toEqual(["Late", "Early", "None"]);
  });
});

describe("filters and counters (R5)", () => {
  const rows = [
    row({ lastName: "A", versionAt: "2026-10-19T08:00:00.000Z" }),
    row({ lastName: "B", status: "evaluation_failed", proposedGrade: null }),
    row({ lastName: "C", versionAt: "2026-10-21T08:00:00.000Z", classes: [{ id: "c2", name: "Grade 10 — B", removed: false }] }),
    row({ lastName: "D", status: "not_assessable", cause: "ai_unavailable", proposedGrade: null }),
    notSubmitted({ lastName: "E" }),
    row({ lastName: "F", status: "transcription_failed", mode: "images", proposedGrade: null }),
  ];

  it("CA3: 'to review' with the order by date: only those, in the order asked", () => {
    const list = arrangeReviewList(rows, query({ status: "to_review", sort: "date", dir: "desc" }), 50);
    expect(names(list.rows)).toEqual(["C", "A"]);
    expect(list.total).toBe(2);
  });

  it("combines the class and the status; 'failed' takes both failures", () => {
    expect(names(arrangeReviewList(rows, query({ classId: "c2", status: "to_review" }), 50).rows)).toEqual(["C"]);
    expect(names(arrangeReviewList(rows, query({ classId: "c1", status: "to_review" }), 50).rows)).toEqual(["A"]);
    expect(names(arrangeReviewList(rows, query({ status: "failed" }), 50).rows)).toEqual(["B", "F"]);
    expect(names(arrangeReviewList(rows, query({ status: "to_submit" }), 50).rows)).toEqual(["E"]);
  });

  it("counts over the whole list, whatever the filters", () => {
    const counts = { to_review: 2, failed: 2, not_assessable: 1 };
    expect(arrangeReviewList(rows, query(), 50).counts).toEqual(counts);
    expect(arrangeReviewList(rows, query({ classId: "c2", status: "failed" }), 50).counts).toEqual(counts);
  });

  it("shows the last page when asked past it", () => {
    const list = arrangeReviewList(rows, query({ page: 9 }), 4);
    expect(list).toMatchObject({ page: 2, pageCount: 2, total: 6 });
    expect(names(list.rows)).toEqual(["E", "F"]);
  });
});

describe("the list's state in the URL", () => {
  it("reads it back, kept when going to a copy and back", () => {
    const state = query({ sort: "grade", dir: "desc", classId: "c2", status: "failed", page: 3 });
    const search = reviewListSearch(state);
    expect(search).toBe("?sort=grade&dir=desc&class=c2&status=failed&page=3");
    expect(parseReviewListQuery(Object.fromEntries(new URLSearchParams(search)), ["c1", "c2"])).toEqual(state);
    expect(reviewListSearch(DEFAULT_REVIEW_QUERY)).toBe("");
  });

  it("falls back to the default for anything unknown, and a class not of the assignment", () => {
    expect(
      parseReviewListQuery({ sort: "email", dir: "up", class: "other", status: "deleted", page: "-2" }, ["c1"]),
    ).toEqual(DEFAULT_REVIEW_QUERY);
    expect(parseReviewListQuery({ page: "2.5", sort: ["date", "grade"] }, [])).toEqual(query({ sort: "date" }));
  });
});
