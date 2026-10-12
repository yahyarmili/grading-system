import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { Card } from "@/components/card";
import { EMAIL_VERIFICATION_TTL } from "@/config/provisional";
import { formatDuration } from "@/lib/duration";

export const metadata: Metadata = { title: "Check your email" };

/** Same screen whether the address was new or already had an account (AUTH-01 CA2). */
export default function Page() {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck aria-hidden="true" className="size-8 text-link" />
        <h1 className="text-lg">Check your email</h1>
        <p>We sent you an email. Open the link inside it to confirm your address and finish signing up.</p>
        <p className="text-sm text-fg-muted">
          The link works once and expires in {formatDuration(EMAIL_VERIFICATION_TTL)}. If you cannot
          find the email, look in your spam folder.
        </p>
      </div>
    </Card>
  );
}
