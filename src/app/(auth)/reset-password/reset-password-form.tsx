"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import { PASSWORD_MIN_LENGTH } from "@/config/provisional";
import type { ResetPasswordState } from "@/server/auth/recovery";
import { resetPasswordAction } from "../actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(resetPasswordAction, {
    status: "idle",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "invalid") inputRef.current?.focus();
  }, [state]);

  if (state.status === "invalid-link") return <InvalidResetLink />;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg">Choose a new password</h1>
        <p className="text-sm text-fg-muted">
          You will be signed out everywhere, then you sign in with the new password.
        </p>
      </div>
      <input type="hidden" name="token" value={token} />
      <FormField
        label="New password"
        required
        error={state.status === "invalid" ? state.error : undefined}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      >
        <input
          ref={inputRef}
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
        />
      </FormField>
      <button type="submit" className="btn btn-primary w-full" disabled={pending} aria-disabled={pending}>
        {pending && <Spinner />}
        {pending ? "Saving…" : "Save the new password"}
      </button>
    </form>
  );
}

/** Expired, already used, replaced by a newer link or altered: one message (AUTH-05 CA1). */
export function InvalidResetLink() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg">This link does not work</h1>
      <Alert tone="error" title="Link expired or invalid" live>
        A password reset link works only once, expires, and stops working when a newer one is sent.
        Your password has not changed.
      </Alert>
      <Link className="btn btn-secondary w-full" href="/forgot-password">
        Get a new link
      </Link>
    </div>
  );
}
