import { Suspense } from "react";
import { LoadingState } from "@/components/loading";
import { RubricView } from "@/components/rubric-view";
import { PageHeader } from "@/components/shell/shell-parts";
import { getActor } from "@/server/auth/session";
import { getPublishedRubrics } from "@/server/data/rubric/rubric";

/**
 * The page of /teacher/rubric and /student/rubric: the title at once, the
 * rubric once the actor is known; `selected`, read from ?version=, shows that
 * version first (a student's result links to the one it was given on, E8.3).
 */
export function RubricPage({ selected }: { selected?: Promise<string | undefined> }) {
  return (
    <>
      <PageHeader title="Rubric" />
      <Suspense fallback={<LoadingState label="Loading the rubric…" />}>
        <PublishedRubrics selected={selected} />
      </Suspense>
    </>
  );
}

async function PublishedRubrics({ selected }: { selected?: Promise<string | undefined> }) {
  return <RubricView rubrics={await getPublishedRubrics(await getActor())} selected={await selected} />;
}
