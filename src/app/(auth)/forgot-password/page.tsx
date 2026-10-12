import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { PASSWORD_RESET_TTL } from "@/config/provisional";
import { formatDuration } from "@/lib/duration";
import { forgotPasswordAction } from "../actions";
import { EmailLinkRequestForm } from "../email-link-request-form";

export const metadata: Metadata = { title: "Forgot your password" };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Forgot your password</h1>
      <Card title="Reset your password" description="We send a link to choose a new password.">
        <EmailLinkRequestForm
          action={forgotPasswordAction}
          submitLabel="Send the link"
          pendingLabel="Sending…"
          done={
            <>
              <p>If an account uses this address, we sent it a link to choose a new password.</p>
              <p className="text-sm text-fg-muted">
                The link works once and expires in {formatDuration(PASSWORD_RESET_TTL)}. If you cannot
                find the email, look in your spam folder.
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
