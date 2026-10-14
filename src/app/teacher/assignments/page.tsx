import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardCheck, ClipboardList, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading";
import { PageHeader } from "@/components/shell/shell-parts";
import { Button } from "@/components/ui/button";
import { getActor } from "@/server/auth/session";
import { listTeacherAssignments } from "@/server/data/assignments/assignments";
import { AssignmentsTable } from "./assignments-table";

export const metadata: Metadata = { title: "Assignments" };

// ASG-02: the teacher's own assignments only; the data layer filters on the owner.

function NewAssignmentButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  return (
    <Button variant={variant} asChild>
      <Link href="/teacher/assignments/new">
        <Plus aria-hidden="true" />
        New assignment
      </Link>
    </Button>
  );
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Assignments" actions={<NewAssignmentButton />} />
          <LoadingState label="Loading assignments…" />
        </>
      }
    >
      <AssignmentList />
    </Suspense>
  );
}

async function AssignmentList() {
  const rows = await listTeacherAssignments(await getActor());
  const toReview = rows.reduce((sum, a) => sum + a.toReview, 0);

  return (
    <>
      <PageHeader
        title="Assignments"
        meta={
          rows.length > 0
            ? [
                { icon: ClipboardList, label: count(rows.length, "assignment", "assignments") },
                { icon: ClipboardCheck, label: count(toReview, "copy to review", "copies to review") },
              ]
            : undefined
        }
        actions={<NewAssignmentButton />}
      />
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description="Create an assignment and choose the classes that receive it."
            action={<NewAssignmentButton variant="outline" />}
          />
        </div>
      ) : (
        <AssignmentsTable rows={rows} />
      )}
    </>
  );
}
