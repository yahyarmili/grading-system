import { CalendarDays, FileText } from "lucide-react";
import { Alert } from "@/components/alert";
import { EmptyState } from "@/components/empty-state";
import { MetaList } from "@/components/shell/shell-parts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assignmentLanguages, languageLabels } from "@/lib/assignment";
import { formatDate } from "@/lib/dates";
import { calculateGrade, formatGrade } from "@/lib/grade";
import { levels, type Level, type RubricVersion } from "@/lib/rubric";
import { FRENCH_RUBRIC_PENDING_NOTICE, GRADE_RULE, RUBRIC_FIXED_NOTICE } from "@/lib/texts";
import type { PublishedRubrics } from "@/server/data/rubric/rubric";

// EVL-01: the rubric in force, read-only, the same screen for the teacher
// (desktop) and the student (phone). Nothing here writes: no form, no button
// but the language tabs, which only switch the view. Every published version
// shows here by itself: publishing the French one (conception/procedures.md)
// needs no change of this screen.

/** Highest level first, as in the client's rubric. */
const byLevel = [...levels].reverse() as Level[];

const EXAMPLE: Level[] = [3, 2, 4, 3, 2];

/** `selected`: the version to show first (a result links to the one it was given on, E8.3). */
export function RubricView({ rubrics, selected }: { rubrics: PublishedRubrics; selected?: string }) {
  const versions = assignmentLanguages.flatMap((language) => rubrics[language] ?? []);
  if (versions.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={FileText} title="No rubric published yet" description="The rubric will appear here once it is published." />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-fg-muted">{RUBRIC_FIXED_NOTICE}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="grade-rule" className="card flex flex-col gap-2 p-4 md:p-5">
          <h2 id="grade-rule" className="text-base font-semibold">
            {GRADE_RULE.title}
          </h2>
          <p>{GRADE_RULE.body}</p>
          <p className="text-fg-muted">
            For example, levels <span className="tabular-nums">{EXAMPLE.join(" + ")}</span> give{" "}
            <span className="font-semibold text-fg tabular-nums">{formatGrade(calculateGrade(EXAMPLE))}</span>.
          </p>
        </section>
        {!rubrics.fr && (
          <Alert tone="info" title={FRENCH_RUBRIC_PENDING_NOTICE.title} className="self-start">
            {FRENCH_RUBRIC_PENDING_NOTICE.body}
          </Alert>
        )}
      </div>

      {versions.length === 1 ? (
        <Version version={versions[0]} />
      ) : (
        <Tabs defaultValue={versions.find((v) => v.id === selected)?.id ?? versions[0].id}>
          <TabsList aria-label="Language of the rubric">
            {versions.map((v) => (
              <TabsTrigger key={v.id} value={v.id} className="px-3 text-base">
                {languageLabels[v.language]}
              </TabsTrigger>
            ))}
          </TabsList>
          {versions.map((v) => (
            <TabsContent key={v.id} value={v.id} className="pt-4 text-base">
              <Version version={v} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

/** One published version: its identity (R2), then its five criteria. */
function Version({ version }: { version: RubricVersion }) {
  return (
    <div className="flex flex-col gap-3">
      <MetaList
        items={[
          { icon: FileText, label: `${languageLabels[version.language]} · version ${version.id}` },
          // Noon UTC: the same day in the time zone of the screens.
          { icon: CalendarDays, label: `Published ${formatDate(`${version.publishedOn}T12:00:00Z`)}` },
        ]}
      />
      <ol aria-label={`Criteria, ${languageLabels[version.language]}`} className="flex flex-col gap-4">
        {version.criteria.map((criterion, i) => (
          <CriterionCard key={criterion.id} index={i + 1} version={version} criterion={criterion} />
        ))}
      </ol>
    </div>
  );
}

function CriterionCard({
  index,
  version,
  criterion,
}: {
  index: number;
  version: RubricVersion;
  criterion: RubricVersion["criteria"][number];
}) {
  const headingId = `criterion-${version.id}-${criterion.id}`;
  return (
    <li>
      <section aria-labelledby={headingId} className="card @container">
        <header className="card-header">
          <h2 id={headingId} className="min-w-0 text-base font-semibold break-words">
            {index}. {criterion.name}
          </h2>
          <span className="shrink-0 text-sm font-normal text-fg-muted">
            <span className="font-semibold text-fg tabular-nums">{criterion.weight}%</span> of the grade
          </span>
        </header>
        {/* Narrow card: one level per row. Wide card (teacher desktop): the five levels side by side, highest first. */}
        <dl className="grid divide-y divide-border-subtle @4xl:grid-cols-5 @4xl:divide-x @4xl:divide-y-0">
          {byLevel.map((level) => (
            <div
              key={level}
              className="flex flex-col gap-1.5 px-4 py-3 @lg:grid @lg:grid-cols-[11rem_1fr] @lg:gap-4 @lg:px-6 @4xl:flex @4xl:px-4 @4xl:py-4"
            >
              <dt className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border-control font-semibold tabular-nums"
                >
                  {level}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="font-semibold">
                    <span className="sr-only">Level {level}: </span>
                    {version.levelNames[level].name}
                  </span>
                  <span className="text-sm text-fg-muted">{version.levelNames[level].qualifier}</span>
                </span>
              </dt>
              <dd className="text-sm">{criterion.descriptors[level]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </li>
  );
}
