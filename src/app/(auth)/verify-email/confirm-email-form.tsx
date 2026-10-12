"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { Alert } from "@/components/alert";
import { Spinner } from "@/components/loading";
import type { ConfirmEmailState } from "@/server/auth/sign-up";
import { confirmEmailAction } from "../actions";

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ConfirmEmailState, FormData>(
    confirmEmailAction,
    { status: "idle" },
  );

  if (state.status === "invalid") return <InvalidLink />;

  return (
    <form action={formAction} className="flex flex-col items-center gap-3 text-center">
      <MailCheck aria-hidden="true" className="size-8 text-link" />
      <h1 className="text-lg">Confirm your email address</h1>
      <p>Confirm that this address is yours to finish creating your student account.</p>
      <input type="hidden" name="token" value={token} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending} aria-disabled={pending}>
        {pending && <Spinner />}
        {pending ? "Confirming…" : "Confirm my email"}
      </button>
    </form>
  );
}

/** Expired, already used, replaced by a newer link or altered: one message (AUTH-01 CA4). */
export function InvalidLink() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg">This link does not work</h1>
      <Alert tone="error" title="Link expired or invalid" live>
        A confirmation link works only once, expires, and stops working when a newer one is sent.
      </Alert>
      <p className="text-sm text-fg-muted">
        If your email is not confirmed yet,{" "}
        <Link className="link" href="/resend-confirmation">
          get a new confirmation link
        </Link>
        .
      </p>
    </div>
  );
}
