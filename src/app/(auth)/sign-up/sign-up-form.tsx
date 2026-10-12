"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import { PASSWORD_MIN_LENGTH } from "@/config/provisional";
import type { SignUpField, SignUpState } from "@/server/auth/sign-up";
import { signUpAction } from "../actions";

const FIELD_ORDER: SignUpField[] = ["firstName", "lastName", "email", "password"];

/** Validated on the server (Zod); errors come back per field, focus goes to the first one. */
export function SignUpForm() {
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(signUpAction, {
    status: "idle",
  });
  const formRef = useRef<HTMLFormElement>(null);

  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const values = state.status === "invalid" ? state.values : {};
  const errorList = FIELD_ORDER.flatMap((field) =>
    fieldErrors[field] ? [[field, fieldErrors[field]] as const] : [],
  );

  useEffect(() => {
    if (state.status !== "invalid") return;
    const first = FIELD_ORDER.find((field) => state.fieldErrors[field]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {errorList.length > 0 && (
        <Alert tone="error" title="Fix the following fields" live>
          <ul className="list-disc pl-5">
            {errorList.map(([field, message]) => (
              <li key={field}>
                <a className="link" href={`#${field}`}>
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {state.status === "error" && (
        <Alert tone="error" title="Your account was not created" live>
          {state.message}
        </Alert>
      )}

      {/* key: refills the typed values after a server answer (uncontrolled inputs). */}
      <div key={JSON.stringify(values)} className="flex flex-col gap-4">
        <FormField label="First name" required error={fieldErrors.firstName}>
          <input
            id="firstName"
            name="firstName"
            className="input"
            autoComplete="given-name"
            defaultValue={values.firstName}
          />
        </FormField>
        <FormField label="Last name" required error={fieldErrors.lastName}>
          <input
            id="lastName"
            name="lastName"
            className="input"
            autoComplete="family-name"
            defaultValue={values.lastName}
          />
        </FormField>
        <FormField
          label="Email"
          required
          error={fieldErrors.email}
          hint="Your own address: we send a link to confirm it."
        >
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            className="input"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={values.email}
          />
        </FormField>
        <FormField
          label="Password"
          required
          error={fieldErrors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        >
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" />
        </FormField>
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={pending} aria-disabled={pending}>
        {pending && <Spinner />}
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
