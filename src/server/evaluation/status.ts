import type { AiStatus } from "@/server/data/evaluation/measures";

// Spec 0012, AC-11: the text of ai:status, from what readAiStatus read and the
// guard's month cost. Identifiers, counts and costs only; an empty field is "-".

/** This UTC month's cost against the cap, and this UTC day's requests against the commands' limit. */
export type StatusPeriod = { now: Date; monthCostUsd: number; capUsd: number; requestsToday: number; dailyLimit: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * `--since`: a date (00:00 UTC) or an ISO instant with its offset; null when
 * it does not parse or is after `now`.
 */
export function parseSince(value: string, now: Date): Date | null {
  const text = DATE.test(value) ? `${value}T00:00:00Z` : INSTANT.test(value) ? value : null;
  if (!text) return null;
  const since = new Date(text);
  if (Number.isNaN(since.getTime()) || (DATE.test(value) && since.toISOString().slice(0, 10) !== value)) return null;
  return since > now ? null : since;
}

const field = (value: string | number | null | undefined) => (value === null || value === undefined || value === "" ? "-" : String(value));
const row = (cells: (string | number | null | undefined)[]) => `| ${cells.map(field).join(" | ")} |`;

/** The three parts in Markdown, each titled with its period. */
export function formatStatus(status: AiStatus, period: StatusPeriod): string {
  const since = status.windowStart.toISOString();
  const lines = [`# AI status`, "", `Date: ${period.now.toISOString()}. Window start: ${since}.`];

  lines.push("", `## Runs since ${since}`, "");
  if (status.runs.length === 0) lines.push("No run.");
  else {
    lines.push(
      "| Kind | Created (UTC) | Submission | Draft | Page | Version | Provider | Model answered | Outcome | Attempts |",
      "|---|---|---|---|---|---|---|---|---|---|",
      ...status.runs.map((r) =>
        row([r.kind, r.createdAt.toISOString(), r.submissionId, r.draftId, r.pageId, r.versionNumber, r.provider, r.modelAnswered, r.outcome, r.attempts]),
      ),
    );
  }
  if (status.runsLeftOut > 0) lines.push("", `${status.runsLeftOut} more runs in the window, not listed.`);

  lines.push("", "### Runs per submission and version, over all time", "");
  if (status.evaluationsPerVersion.length === 0) lines.push("No evaluation run.");
  else lines.push("| Submission | Version | Evaluation runs |", "|---|---|---|", ...status.evaluationsPerVersion.map((c) => row([c.submissionId, c.versionNumber, c.runs])));

  lines.push("", "### Reading runs per page, over all time", "");
  if (status.readingsPerPage.length === 0) lines.push("No reading run.");
  else lines.push("| Submission | Page | Reading runs |", "|---|---|---|", ...status.readingsPerPage.map((c) => row([c.submissionId, c.pageId, c.runs])));

  lines.push("", `## AI requests since ${since}`, "");
  if (status.requests.length === 0) lines.push("No request.");
  else {
    lines.push(
      "| Subject | Label | Reading of submission | Reading of draft | Requests |",
      "|---|---|---|---|---|",
      ...status.requests.map((g) => row([g.subjectId, g.label, g.readingSubmissionId, g.readingDraftId, g.requests])),
    );
  }

  const iso = period.now.toISOString();
  const reached = period.monthCostUsd >= period.capUsd;
  lines.push(
    "",
    `## This UTC month (${iso.slice(0, 7)}) and this UTC day (${iso.slice(0, 10)})`,
    "",
    `- Estimated cost this month: $${period.monthCostUsd.toFixed(6)} of the $${period.capUsd} cap (${reached ? "reached" : "not reached"}).`,
    `- AI requests today: ${period.requestsToday} of ${period.dailyLimit} (the commands' limit, not the app's).`,
  );
  return lines.join("\n") + "\n";
}
