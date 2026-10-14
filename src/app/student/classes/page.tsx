import type { Metadata } from "next";
import { Suspense } from "react";
import { School, UserRound } from "lucide-react";
import { Alert } from "@/components/alert";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading";
import { MetaList, PageHeader } from "@/components/shell/shell-parts";
import { getActor } from "@/server/auth/session";
import { JOIN_MESSAGES, type JoinNotice } from "@/server/classes/join";
import { listClasses } from "@/server/data/classes/classes";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "My classes" };

// CLS-03: the student's active classes, and joining one by its code.
// A class the student was removed from is no longer listed (CLS-04).

export default function Page({ searchParams }: PageProps<"/student/classes">) {
  return (
    <>
      <PageHeader title="My classes" />
      <div className="flex flex-col gap-6">
        <Suspense fallback={null}>
          <LinkNotice searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<LoadingState label="Loading your classes…" />}>
          <ClassList />
        </Suspense>
        <Card title="Join a class" description="Enter the code your teacher gave you. You join at once.">
          <JoinForm />
        </Card>
      </div>
    </>
  );
}

const NOTICES: Record<JoinNotice, { tone: "info" | "error"; title: string; text: string }> = {
  done: { tone: "info", title: "You are in the class", text: "It is listed below." },
  refused: { tone: "error", title: "You did not join a class", text: JOIN_MESSAGES.refused },
  locked: { tone: "error", title: "You did not join a class", text: JOIN_MESSAGES.locked },
  unconfirmed: { tone: "error", title: "You did not join a class", text: JOIN_MESSAGES.unconfirmed },
};

/** After a class link (/join, sign-in): what happened. */
async function LinkNotice({ searchParams }: Pick<PageProps<"/student/classes">, "searchParams">) {
  const { join } = await searchParams;
  // Own keys only: "constructor" or "toString" in the URL is not a notice.
  const notice = typeof join === "string" && Object.hasOwn(NOTICES, join) ? NOTICES[join as JoinNotice] : null;
  if (!notice) return null;
  return (
    <Alert tone={notice.tone} title={notice.title} live>
      {notice.text}
    </Alert>
  );
}

async function ClassList() {
  const list = await listClasses(await getActor());
  if (list.role !== "student") return null;

  if (list.classes.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={School}
          title="You are not in a class yet"
          description="Open the link your teacher shared, or enter their code below."
        />
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="My classes">
      {list.classes.map((c) => (
        <li key={c.id} className="card flex flex-col gap-1.5 p-4">
          <h2 className="text-base font-semibold break-words">{c.name}</h2>
          <MetaList items={[{ icon: UserRound, label: c.teacherName }]} />
        </li>
      ))}
    </ul>
  );
}
