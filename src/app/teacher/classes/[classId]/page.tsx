import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BackLink, PageHeader } from "@/components/shell/shell-parts";
import { CLASS_INVITE_TTL } from "@/config/provisional";
import { formatDuration } from "@/lib/duration";
import { getActor } from "@/server/auth/session";
import { getClass } from "@/server/data/classes/classes";
import { getClassInvite } from "@/server/data/classes/invites";
import { InviteCard } from "./invite-card";

export const metadata: Metadata = { title: "Class" };

// One of the teacher's classes. Another teacher's class, or one that does
// not exist, answers 404 alike (AUTH-04 R3). The check runs before any
// streaming, which would fix the status at 200: the page blocks on it.
export const instant = false;

// [Q7 open] No automatic expiry for now; the text follows the provisional value.
const validity =
  CLASS_INVITE_TTL === null
    ? "They work until you disable them or generate new ones."
    : `They work for ${formatDuration(CLASS_INVITE_TTL)} after they are generated, unless you disable them first.`;

export default async function Page({ params }: PageProps<"/teacher/classes/[classId]">) {
  const { classId } = await params;
  if (!z.uuid().safeParse(classId).success) notFound();
  const actor = await getActor();
  const [found, invite] = await Promise.all([getClass(actor, classId), getClassInvite(actor, classId)]);
  if (!found || !invite) notFound();

  return (
    <>
      <BackLink href="/teacher/classes">Classes</BackLink>
      <PageHeader title={found.name} />
      <div className="flex max-w-3xl flex-col gap-6">
        <InviteCard classId={found.id} invite={invite} validity={validity} />
      </div>
    </>
  );
}
