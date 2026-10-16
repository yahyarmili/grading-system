import { Suspense } from "react";
import { LoadingState } from "@/components/loading";
import { RubricView } from "@/components/rubric-view";
import { PageHeader } from "@/components/shell/shell-parts";
import { getActor } from "@/server/auth/session";
import { getPublishedRubrics } from "@/server/data/rubric/rubric";

/** The page of /teacher/rubric and /student/rubric: the title at once, the rubric once the actor is known. */
export function RubricPage() {
  return (
    <>
      <PageHeader title="Rubric" />
      <Suspense fallback={<LoadingState label="Loading the rubric…" />}>
        <PublishedRubrics />
      </Suspense>
    </>
  );
}

async function PublishedRubrics() {
  return <RubricView rubrics={await getPublishedRubrics(await getActor())} />;
}
