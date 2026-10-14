import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { School } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading";
import { BackLink, PageHeader } from "@/components/shell/shell-parts";
import { Button } from "@/components/ui/button";
import { getActor } from "@/server/auth/session";
import { listClasses } from "@/server/data/classes/classes";
import { NewAssignmentForm } from "./new-assignment-form";

export const metadata: Metadata = { title: "New assignment" };

// ASG-01: the form offers the teacher's own classes only; the server checks
// them again, whatever the request sends.

export default function Page() {
  return (
    <>
      <BackLink href="/teacher/assignments">Assignments</BackLink>
      <PageHeader title="New assignment" />
      <Suspense fallback={<LoadingState label="Loading your classes…" />}>
        <NewAssignment />
      </Suspense>
    </>
  );
}

async function NewAssignment() {
  const list = await listClasses(await getActor());
  if (list.role !== "teacher") return null;

  if (list.classes.length === 0) {
    return (
      <div className="card max-w-3xl">
        <EmptyState
          icon={School}
          title="Create a class first"
          description="An assignment is sent to one or more of your classes."
          action={
            <Button asChild>
              <Link href="/teacher/classes">Go to Classes</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <NewAssignmentForm classes={list.classes.map(({ id, name }) => ({ id, name }))} />;
}
