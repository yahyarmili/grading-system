import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/card";
import { roleHome } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <LeaveIfSignedIn />
      </Suspense>
      <h1 className="sr-only">Sign in</h1>
      <Card title="Sign in" description="Students, teachers and administrators.">
        <SignInForm />
      </Card>
      <p className="text-center text-sm">
        New student?{" "}
        <Link className="link" href="/sign-up">
          Create your account
        </Link>
      </p>
    </div>
  );
}

/** Already signed in: straight to the space of the role. Reads the session, so behind Suspense. */
async function LeaveIfSignedIn() {
  const user = await getCurrentUser();
  if (user) redirect(roleHome[user.role]);
  return null;
}
