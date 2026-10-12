"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import type { SignInState } from "@/server/auth/sign-in";
import { signInAction } from "../actions";

// The server returns a status only. One message for an unknown email, a wrong
// password and a lockout (AUTH-02 R2, CA3).
const REJECTED = "Invalid email or password.";

export function SignInForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, {
    status: "idle",
  });
  const formRef = useRef<HTMLFormElement>(null);

  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const email = "email" in state ? state.email : "";

  useEffect(() => {
    if (state.status === "invalid") {
      const first = (["email", "password"] as const).find((field) => state.fieldErrors[field]);
      if (first) formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
    } else if (state.status === "rejected") {
      // The password is cleared after a failure: start again from it.
      formRef.current?.querySelector<HTMLElement>("#password")?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {state.status === "rejected" && (
        <Alert tone="error" title={REJECTED} live>
          Check your email address and password, then try again.
        </Alert>
      )}
      {state.status === "unconfirmed" && (
        <Alert tone="warning" title="Confirm your email address first" live>
          Open the link we sent you to confirm your address. No email, or the link expired?{" "}
          <Link className="link" href="/resend-confirmation">
            Get a new confirmation link
          </Link>
          .
        </Alert>
      )}

      <div key={`${state.status}:${email}`} className="flex flex-col gap-4">
        <FormField label="Email" required error={fieldErrors.email}>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            className="input"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={email}
          />
        </FormField>
        <FormField label="Password" required error={fieldErrors.password}>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" />
        </FormField>
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={pending} aria-disabled={pending}>
        {pending && <Spinner />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-xs text-fg-muted">
        After several failed attempts, signing in is paused for a while, even with the right password.
      </p>
    </form>
  );
}
