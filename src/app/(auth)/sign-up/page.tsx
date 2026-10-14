import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/card";
import { InviteNotice } from "../invite-notice";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Sign up" };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Sign up</h1>
      <Suspense fallback={null}>
        <InviteNotice action="sign-up" />
      </Suspense>
      <Card
        title="Create your student account"
        description="Teachers get their account from an administrator."
      >
        <SignUpForm />
      </Card>
      <p className="text-center text-sm">
        Already have an account?{" "}
        <Link className="link" href="/sign-in">
          Sign in
        </Link>
      </p>
    </div>
  );
}
