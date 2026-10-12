import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/card";
import { LoadingState } from "@/components/loading";
import { tokenSchema } from "@/server/auth/schemas";
import { InvalidResetLink, ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  // The token is in the URL: never send it to another site.
  referrer: "no-referrer",
};

/** Opening the link changes nothing: the link is used only when the form is sent. */
export default function Page({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Card>
      <Suspense fallback={<LoadingState />}>
        <Reset searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}

async function Reset({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  const { token } = await searchParams;
  const parsed = tokenSchema.safeParse(token);
  return parsed.success ? <ResetPasswordForm token={parsed.data} /> : <InvalidResetLink />;
}
