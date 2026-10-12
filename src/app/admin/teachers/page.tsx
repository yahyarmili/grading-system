import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/card";
import { LoadingState } from "@/components/loading";
import { PageHeader } from "@/components/shell/shell-parts";
import { TEACHER_INVITATION_TTL } from "@/config/provisional";
import { formatDuration } from "@/lib/duration";
import { getActor } from "@/server/auth/session";
import { listTeacherInvitations } from "@/server/data/auth/invitations";
import { InvitationsTable } from "./invitations-table";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Teachers" };

// AUTH-03: the administrator's only screen. Teacher accounts exist only through
// an invitation; the data layer refuses every action to anyone but the admin.

export default function Page() {
  return (
    <>
      <PageHeader title="Teachers" />
      <div className="flex flex-col gap-6">
        <Card
          title="Invite a teacher"
          description={`The teacher receives a link to choose a password. It works once and expires in ${formatDuration(TEACHER_INVITATION_TTL)}.`}
        >
          <InviteForm />
        </Card>
        <Suspense fallback={<LoadingState label="Loading invitations…" />}>
          <Invitations />
        </Suspense>
      </div>
    </>
  );
}

async function Invitations() {
  const rows = await listTeacherInvitations(await getActor());
  return <InvitationsTable rows={rows} />;
}
