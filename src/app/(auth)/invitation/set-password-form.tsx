"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import { PASSWORD_MIN_LENGTH } from "@/config/provisional";
import type { AcceptInvitationState } from "@/server/auth/invitations";
import { acceptInvitationAction } from "../actions";

export function SetPasswordForm({ token, email, firstName }: { token: string; email: string; firstName: string }) {
  const [state, formAction, pending] = useActionState<AcceptInvitationState, FormData>(acceptInvitationAction, {
    status: "idle",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "invalid") inputRef.current?.focus();
  }, [state]);

  if (state.status === "invalid-link") return <InvalidInvitation />;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg">Set your password</h1>
        <p className="text-fg-muted">
          Welcome, {firstName}. Choose a password to open your teacher account.
        </p>
      </div>
      <input type="hidden" name="token" value={token} />
      <FormField label="Email" hint="Your account's email, chosen by the administrator.">
        {/* Shown for password managers; never sent: the invitation fixes the email. */}
        <input id="email" type="email" className="input" value={email} readOnly autoComplete="username" />
      </FormField>
      <FormField
        label="Password"
        required
        error={state.status === "invalid" ? state.error : undefined}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      >
        <input ref={inputRef} id="password" name="password" type="password" className="input" autoComplete="new-password" />
      </FormField>
      <button type="submit" className="btn btn-primary w-full" disabled={pending} aria-disabled={pending}>
        {pending && <Spinner />}
        {pending ? "Opening your account…" : "Set password and sign in"}
      </button>
    </form>
  );
}

/** Expired, used, cancelled, replaced or altered: one message (AUTH-03 CA3). */
export function InvalidInvitation() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg">This invitation does not work</h1>
      <Alert tone="error" title="Invitation expired or invalid" live>
        An invitation link works only once, expires, and stops working when the administrator sends a
        new one or cancels the invitation.
      </Alert>
      <p className="text-sm text-fg-muted">
        Ask your administrator to send you a new invitation. If you already set your password, sign in.
      </p>
      <Link className="btn btn-secondary w-full" href="/sign-in">
        Sign in
      </Link>
    </div>
  );
}
