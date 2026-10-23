import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Info, Sparkles, UserCheck } from "lucide-react";
import { z } from "zod";
import { Alert } from "@/components/alert";
import { BackLink, PageHeader } from "@/components/shell/shell-parts";
import { StudentStatusTag } from "@/components/status-tag";
import { formatGrade } from "@/lib/grade";
import { publishedRubric, rubricVersionById, type RubricVersion } from "@/lib/rubric";
import type { StudentResult, StudentResultCriterion } from "@/lib/student-result";
import {
  GRADE_ADJUSTED_NOTICE,
  RESULT_AI_MENTION,
  RESULT_MARKED_BY_TEACHER,
  RESULT_RUBRIC_SUBSTITUTE_NOTICE,
} from "@/lib/texts";
import { getActor } from "@/server/auth/session";
import { getPublishedResult } from "@/server/data/results/student";
import { resultToken } from "@/server/results/freshness";
import { ResultFreshness } from "./result-freshness";

export const metadata: Metadata = { title: "Your result" };

// PUB-02 (E8.3): the student's published result, from the closed projection
// (src/server/data/results/student.ts) and nothing else: the grade as set,
// each criterion's level and remark, the general comment, the next steps, the
// rubric they were given on. Not published, withdrawn, another student's or
// missing: a real 404, checked before any streaming (instant = false), the
// same for all. Server components only: the one client component receives
// the assignment's id and an opaque token, never the result's data.
export const instant = false;

export default async function Page({ params }: PageProps<"/student/assignments/[assignmentId]/result">) {
  const { assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();
  const result = await getPublishedResult(await getActor(), assignmentId);
  if (!result) notFound();
  // The version recorded with the evaluation; one no longer in the registry: the English one in force.
  const rubric = rubricVersionById(result.rubricVersion) ?? publishedRubric("en")!;

  return (
    <>
      <BackLink href={`/student/assignments/${result.assignmentId}`}>{result.title}</BackLink>
      <PageHeader title="Your result" />
      <ResultFreshness assignmentId={result.assignmentId} token={resultToken(result)}>
        <div className="flex max-w-2xl flex-col gap-5">
          <GradeCard result={result} />
          {rubric.language !== result.language && <Alert tone="info">{RESULT_RUBRIC_SUBSTITUTE_NOTICE}</Alert>}
          <section aria-labelledby="criteria-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="criteria-title" className="text-base font-semibold">
                By criterion
              </h2>
              <Link
                href={`/student/rubric?version=${encodeURIComponent(rubric.id)}`}
                prefetch={false}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-link underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <BookOpen aria-hidden="true" className="size-4" />
                See the rubric
              </Link>
            </div>
            <ol className="flex flex-col gap-3">
              {result.criteria.map((criterion, i) => (
                <CriterionResult key={criterion.id} index={i + 1} criterion={criterion} rubric={rubric} language={result.language} />
              ))}
            </ol>
          </section>
          <section aria-labelledby="comment-title" className="card flex flex-col gap-2 p-4">
            <h2 id="comment-title" className="text-base font-semibold">
              General comment
            </h2>
            {result.generalComment ? (
              <p lang={result.language} className="break-words whitespace-pre-wrap">
                {result.generalComment}
              </p>
            ) : (
              <p className="text-fg-muted">No general comment.</p>
            )}
          </section>
          <section aria-labelledby="next-steps-title" className="card flex flex-col gap-2 p-4">
            <h2 id="next-steps-title" className="text-base font-semibold">
              Next steps
            </h2>
            {result.nextSteps.length > 0 ? (
              <ul lang={result.language} className="flex list-disc flex-col gap-1 pl-5">
                {result.nextSteps.map((step, i) => (
                  <li key={i} className="break-words">
                    {step}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted">No next steps.</p>
            )}
          </section>
        </div>
      </ResultFreshness>
    </>
  );
}

/** The grade as the teacher set it (D5), "adjusted" in words and by an icon (Q5, USA-03), then who marked it. */
function GradeCard({ result }: { result: StudentResult }) {
  return (
    <section aria-labelledby="grade-title" className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="grade-title" className="text-base font-semibold">
          Your grade
        </h2>
        <StudentStatusTag status="marked" />
      </div>
      <p className="text-3xl font-semibold tabular-nums">{formatGrade(result.finalGrade)}</p>
      {result.gradeAdjusted && (
        <p className="flex items-center gap-2 text-sm font-medium">
          <Info aria-hidden="true" className="size-4 shrink-0 text-info-fg" />
          {GRADE_ADJUSTED_NOTICE}
        </p>
      )}
      <p className="flex items-start gap-2 text-sm text-fg-muted">
        {result.aiAssisted ? (
          <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        ) : (
          <UserCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        )}
        {result.aiAssisted ? RESULT_AI_MENTION : RESULT_MARKED_BY_TEACHER}
      </p>
    </section>
  );
}

/** One criterion: its name, the level reached with its label and descriptor (of the version recorded), the remark. */
function CriterionResult({
  index,
  criterion,
  rubric,
  language,
}: {
  index: number;
  criterion: StudentResultCriterion;
  rubric: RubricVersion;
  language: StudentResult["language"];
}) {
  const definition = rubric.criteria.find((c) => c.id === criterion.id)!;
  const levelName = rubric.levelNames[criterion.level];
  const headingId = `criterion-${criterion.id}`;
  return (
    <li>
      <section aria-labelledby={headingId} className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 id={headingId} lang={rubric.language} className="min-w-0 font-semibold break-words">
            {index}. {definition.name}
          </h3>
          <p className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border-control font-semibold tabular-nums"
            >
              {criterion.level}
            </span>
            <span className="font-semibold">
              <span className="sr-only">Level {criterion.level}: </span>
              {levelName.name}
            </span>
          </p>
        </div>
        <p lang={rubric.language} className="text-sm text-fg-muted">
          {definition.descriptors[criterion.level]}
        </p>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-fg-muted">Your teacher&apos;s remark</h4>
          {criterion.remark ? (
            <p lang={language} className="break-words whitespace-pre-wrap">
              {criterion.remark}
            </p>
          ) : (
            <p className="text-fg-muted">No remark.</p>
          )}
        </div>
      </section>
    </li>
  );
}
