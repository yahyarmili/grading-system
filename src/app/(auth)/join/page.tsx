import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { School } from "lucide-react";
import { Card } from "@/components/card";
import { LoadingState } from "@/components/loading";
import { roleHome } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/session";
import { rememberInviteAction } from "../actions";
import { JoinButton } from "./join-button";

export const metadata: Metadata = {
  title: "Join a class",
  // The link token is in the URL: never send it to another site.
  referrer: "no-referrer",
};

/**
 * A class link (CLS-03). Opening it joins nothing (mail scanners open links
 * too): a student joins with a button (POST). The page shows no class data
 * and does not say whether the link works: that is learnt only by joining,
 * behind the attempt limit (CLS-02 R2).
 */
export default function Page({ searchParams }: PageProps<"/join">) {
  return (
    <Card>
      <Suspense fallback={<LoadingState />}>
        <Join searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}

async function Join({ searchParams }: Pick<PageProps<"/join">, "searchParams">) {
  const [{ token }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const value = typeof token === "string" ? token : "";

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <School aria-hidden="true" className="size-8 text-link" />
      <h1 className="text-lg">Join a class</h1>
      {!user && (
        <>
          <p>You have been invited to join a class. Sign in or create a student account: you join the class right after.</p>
          <form action={rememberInviteAction} className="flex w-full flex-col gap-2">
            <input type="hidden" name="token" value={value} />
            <button type="submit" name="next" value="sign-in" className="btn btn-primary w-full">
              Sign in to join
            </button>
            <button type="submit" name="next" value="sign-up" className="btn btn-secondary w-full">
              Create a student account
            </button>
          </form>
        </>
      )}
      {user?.role === "student" && (
        <>
          <p>You join the class at once. Your teacher will see your name and email address.</p>
          <JoinButton token={value} />
        </>
      )}
      {user && user.role !== "student" && (
        <>
          <p>Only student accounts can join a class.</p>
          <Link className="btn btn-secondary w-full" href={roleHome[user.role]}>
            Back to my space
          </Link>
        </>
      )}
    </div>
  );
}
