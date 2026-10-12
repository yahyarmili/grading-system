"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import type { InvitationField, InviteState } from "@/server/auth/invitations";
import { inviteTeacherAction } from "./actions";

const FIELDS: InvitationField[] = ["firstName", "lastName", "email"];

export function InviteForm() {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(inviteTeacherAction, {
    status: "idle",
  });
  const formRef = useRef<HTMLFormElement>(null);

  const fieldErrors = state.status === "invalid" || state.status === "refused" ? state.fieldErrors : {};
  const values = state.status === "invalid" || state.status === "refused" ? state.values : {};

  useEffect(() => {
    // After a refusal: the first field in error. After a success: the empty form, ready for the next teacher.
    const errors = state.status === "invalid" || state.status === "refused" ? state.fieldErrors : {};
    const target = state.status === "done" ? "firstName" : FIELDS.find((field) => errors[field]);
    if (target) formRef.current?.querySelector<HTMLElement>(`#invite-${target}`)?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {state.status === "done" &&
        (state.emailSent ? (
          <Alert tone="info" title="Invitation sent" live>
            {state.email} received a link to choose a password.
          </Alert>
        ) : (
          <Alert tone="warning" title="Invitation created, email not sent" live>
            The email to {state.email} could not be sent. Reissue the invitation from the list.
          </Alert>
        ))}
      {state.status === "error" && (
        <Alert tone="error" title="No invitation was created" live>
          {state.message}
        </Alert>
      )}

      {/* key: refills the typed values after a refusal, empties them after a success. */}
      <div key={JSON.stringify([state.status, values])} className="grid gap-4 md:grid-cols-3">
        <FormField label="First name" required error={fieldErrors.firstName}>
          <input id="invite-firstName" name="firstName" className="input" autoComplete="off" defaultValue={values.firstName} />
        </FormField>
        <FormField label="Last name" required error={fieldErrors.lastName}>
          <input id="invite-lastName" name="lastName" className="input" autoComplete="off" defaultValue={values.lastName} />
        </FormField>
        <FormField label="Email" required error={fieldErrors.email}>
          <input
            id="invite-email"
            name="email"
            type="email"
            className="input"
            autoComplete="off"
            spellCheck={false}
            defaultValue={values.email}
          />
        </FormField>
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending} aria-disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Sending the invitation…" : "Send the invitation"}
        </button>
      </div>
    </form>
  );
}
