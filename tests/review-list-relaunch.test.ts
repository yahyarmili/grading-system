import { describe, expect, it } from "vitest";
import { mayOfferRelaunch, type RelaunchCandidate } from "@/lib/relaunch-offer";
import type { ReviewRow } from "@/lib/review-list";
import { publishedRubric } from "@/lib/rubric";
import { submissionStatuses } from "@/lib/submission-status";

// C8b: the list and the copy read relaunchConditions (the month's runs) and
// listRelaunchable only when a copy may be offered. The test proves the
// filter never hides a copy listRelaunchable could offer (PRC-02 R4: not
// assessable, a cause that can go, rubric_unavailable only once its
// language's rubric is published), and spares the reads otherwise. One rule
// for both pages (src/lib/relaunch-offer.ts): a list's line as it is, the
// copy's page with its request mapped.

const row = (over: Partial<ReviewRow>): ReviewRow => ({
  studentId: "s", submission: { id: "x", versionNumber: 1 }, requested: false, refused: false, firstName: "A", lastName: "B",
  classes: [], status: "not_assessable", late: false, mode: "text", versionAt: null, cause: null, teacherGrade: null, proposedGrade: null,
  ...over,
});

/** What the copy's page passes (page.tsx): its request, "pending" while a retry or relaunch waits for its run. */
const copy = (request: "pending" | "abandoned" | null, over: Partial<RelaunchCandidate> = {}): RelaunchCandidate => ({
  status: "not_assessable", requested: request === "pending", cause: "ai_unavailable", ...over,
});

describe("a copy the list or the copy's page may offer to relaunch (C8b)", () => {
  it("AI unavailable: always read, the cost cap and the provider being in the database", () => {
    expect(mayOfferRelaunch(row({ cause: "ai_unavailable" }), "en")).toBe(true);
    expect(mayOfferRelaunch(row({ cause: "ai_unavailable" }), "fr")).toBe(true);
  });

  it("rubric unavailable: read only when the language's rubric is published, as relaunchConditions says", () => {
    for (const language of ["en", "fr"] as const) {
      expect(mayOfferRelaunch(row({ cause: "rubric_unavailable" }), language)).toBe(publishedRubric(language) !== null);
    }
    // The registry of the application: English published, French not yet (Q6).
    expect(mayOfferRelaunch(row({ cause: "rubric_unavailable" }), "en")).toBe(true);
    expect(mayOfferRelaunch(row({ cause: "rubric_unavailable" }), "fr")).toBe(false);
  });

  it("never: no content, a request already waiting, any other status", () => {
    expect(mayOfferRelaunch(row({ cause: "no_content" }), "en")).toBe(false);
    expect(mayOfferRelaunch(row({ cause: "ai_unavailable", requested: true }), "en")).toBe(false);
    for (const status of submissionStatuses.filter((s) => s !== "not_assessable")) {
      expect(mayOfferRelaunch(row({ status, cause: "ai_unavailable" }), "en")).toBe(false);
    }
  });

  it("the copy's page: a pending request is never offered again; an abandoned one, or none, is", () => {
    expect(mayOfferRelaunch(copy("pending"), "en")).toBe(false);
    expect(mayOfferRelaunch(copy("pending", { cause: "rubric_unavailable" }), "en")).toBe(false);
    expect(mayOfferRelaunch(copy("abandoned"), "en")).toBe(true);
    expect(mayOfferRelaunch(copy(null), "en")).toBe(true);
    expect(mayOfferRelaunch(copy(null, { cause: "rubric_unavailable" }), "fr")).toBe(false);
    expect(mayOfferRelaunch(copy(null, { cause: "no_content" }), "en")).toBe(false);
  });
});
