import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/card";
import { LoadingState } from "@/components/loading";
import { tokenSchema } from "@/server/auth/schemas";
import { peekTeacherInvitation } from "@/server/data/auth/invitations";
import { InvalidInvitation, SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Set your password",
  // The token is in the URL: never send it to another site.
  referrer: "no-referrer",
};

/** AUTH-03 R2: opening the link only checks it; the link is used when the password is saved. */
export default function Page({ searchParams }: PageProps<"/invitation">) {
  return (
    <Card>
      <Suspense fallback={<LoadingState />}>
        <Invitation searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}

async function Invitation({ searchParams }: Pick<PageProps<"/invitation">, "searchParams">) {
  const { token } = await searchParams;
  const parsed = tokenSchema.safeParse(token);
  const invitation = parsed.success ? await peekTeacherInvitation(parsed.data) : null;
  return invitation && parsed.success ? (
    <SetPasswordForm token={parsed.data} email={invitation.email} firstName={invitation.firstName} />
  ) : (
    <InvalidInvitation />
  );
}
