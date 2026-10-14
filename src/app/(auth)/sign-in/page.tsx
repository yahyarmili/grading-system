import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Alert } from "@/components/alert";
import { Card } from "@/components/card";
import { roleHome } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/session";
import { InviteNotice } from "../invite-notice";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function Page({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <LeaveIfSignedIn />
      </Suspense>
      <h1 className="sr-only">Sign in</h1>
      <Suspense fallback={null}>
        <ResetNotice searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <InviteNotice action="sign-in" />
      </Suspense>
      <Card title="Sign in" description="Students, teachers and administrators.">
        <SignInForm />
      </Card>
      <ul className="flex flex-col items-center gap-2 text-sm">
        <li>
          <Link className="link" href="/forgot-password">
            Forgot your password?
          </Link>
        </li>
        <li>
          New student?{" "}
          <Link className="link" href="/sign-up">
            Create your account
          </Link>
        </li>
      </ul>
    </div>
  );
}

/** Already signed in: straight to the space of the role. Reads the session, so behind Suspense. */
async function LeaveIfSignedIn() {
  const user = await getCurrentUser();
  if (user) redirect(roleHome[user.role]);
  return null;
}

/** After a password reset (AUTH-05): every session was closed. */
async function ResetNotice({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { reset } = await searchParams;
  if (reset !== "done") return null;
  return (
    <Alert tone="info" title="Password changed" live>
      You were signed out everywhere. Sign in with your new password.
    </Alert>
  );
}
