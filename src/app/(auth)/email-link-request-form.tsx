"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { MailCheck } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import type { LinkRequestState } from "@/server/auth/recovery";

/**
 * One email field that asks for a link (forgot password, new confirmation link).
 * The "done" screen is the same whether the address has an account or not (AUTH-05).
 */
export function EmailLinkRequestForm({
  action,
  submitLabel,
  pendingLabel,
  done,
}: {
  action: (previous: LinkRequestState, form: FormData) => Promise<LinkRequestState>;
  submitLabel: string;
  pendingLabel: string;
  done: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<LinkRequestState, FormData>(action, { status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "invalid") inputRef.current?.focus();
    if (state.status === "done") doneRef.current?.focus();
  }, [state]);

  if (state.status === "done") {
    return (
      <div
        ref={doneRef}
        tabIndex={-1}
        role="status"
        className="flex flex-col items-center gap-3 text-center outline-none"
      >
        <MailCheck aria-hidden="true" className="size-8 text-link" />
        <h2 className="text-lg">Check your email</h2>
        {done}
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <FormField label="Email" required error={state.status === "invalid" ? state.error : undefined}>
        <input
          ref={inputRef}
          key={state.status === "invalid" ? state.email : ""}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          className="input"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.status === "invalid" ? state.email : undefined}
        />
      </FormField>
      <button type="submit" className="btn btn-primary w-full" disabled={pending} aria-disabled={pending}>
        {pending && <Spinner />}
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
