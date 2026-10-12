import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { EMAIL_VERIFICATION_TTL } from "@/config/provisional";
import { formatDuration } from "@/lib/duration";
import { resendConfirmationAction } from "../actions";
import { EmailLinkRequestForm } from "../email-link-request-form";

export const metadata: Metadata = { title: "New confirmation link" };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">New confirmation link</h1>
      <Card
        title="Get a new confirmation link"
        description="For a student account whose email is not confirmed yet."
      >
        <EmailLinkRequestForm
          action={resendConfirmationAction}
          submitLabel="Send a new link"
          pendingLabel="Sending…"
          done={
            <>
              <p>
                If this address has an account waiting for confirmation, we sent it a new link.
                Earlier links no longer work.
              </p>
              <p className="text-sm text-fg-muted">
                The link works once and expires in {formatDuration(EMAIL_VERIFICATION_TTL)}. If you
                cannot find the email, look in your spam folder.
              </p>
            </>
          }
        />
      </Card>
      <p className="text-center text-sm">
        <Link className="link" href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
