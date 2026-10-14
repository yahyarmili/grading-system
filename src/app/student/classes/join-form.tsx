"use client";

import { useActionState } from "react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import type { JoinState } from "@/server/classes/join";
import { joinClassByCodeAction } from "./actions";

/** CLS-03: join a class with the code of the teacher. */
export function JoinForm() {
  const [state, formAction, pending] = useActionState<JoinState, FormData>(joinClassByCodeAction, { status: "idle" });

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      {(state.status === "joined" || state.status === "alreadyMember") && (
        <Alert tone="info" title={state.status === "joined" ? "You joined the class" : "You are already in this class"} live>
          {state.className}
        </Alert>
      )}
      {state.status === "error" && (
        <Alert tone="error" title="You did not join a class" live>
          {state.message}
        </Alert>
      )}
      {/* key: the form is reset after each submission; this gives the typed code back after a refusal. */}
      <FormField
        key={JSON.stringify(state)}
        label="Class code"
        hint="For example ABCD-2345. Letters can be typed in any case."
        error={state.status === "invalid" ? state.error : undefined}
      >
        <input
          id="class-code"
          name="code"
          className="input font-mono uppercase"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          defaultValue={state.status === "invalid" ? state.code : ""}
          autoFocus={state.status === "invalid"}
        />
      </FormField>
      <button type="submit" className="btn btn-primary w-full sm:w-auto sm:self-start" disabled={pending} aria-disabled={pending}>
        {pending && <Spinner />}
        {pending ? "Joining…" : "Join the class"}
      </button>
    </form>
  );
}
