import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/card";
import { LoadingState } from "@/components/loading";
import { tokenSchema } from "@/server/auth/schemas";
import { ConfirmEmailForm, InvalidLink } from "./confirm-email-form";

export const metadata: Metadata = {
  title: "Confirm your email",
  // The token is in the URL: never send it to another site.
  referrer: "no-referrer",
};

/**
 * Opening the link does not confirm: mail scanners open links too and would
 * use up the one-time token. The student confirms with a button (POST).
 */
export default function Page({ searchParams }: PageProps<"/verify-email">) {
  return (
    <Card>
      <Suspense fallback={<LoadingState />}>
        <Confirm searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}

async function Confirm({ searchParams }: Pick<PageProps<"/verify-email">, "searchParams">) {
  const { token } = await searchParams;
  // A malformed link is refused at once; a well-formed one is checked on submit.
  const parsed = tokenSchema.safeParse(token);
  return parsed.success ? <ConfirmEmailForm token={parsed.data} /> : <InvalidLink />;
}
