"use client";

import { useActionState } from "react";
import { Alert } from "@/components/alert";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { AcknowledgeNoticeState } from "@/server/notices/notices";
import { acknowledgeNoticeAction } from "./actions";

// NFR-DON-04: the notice before the first submission, from the texts module.
// Reading it is recorded (account, date, version); the text box comes after.

export function StudentNotice() {
  const [state, formAction, pending] = useActionState<AcknowledgeNoticeState, FormData>(acknowledgeNoticeAction, {
    status: "idle",
  });
  return (
    <section aria-labelledby="notice-title" className="card flex flex-col gap-4 p-4">
      <h2 id="notice-title" className="text-base font-semibold">
        {STUDENT_NOTICE.title}
      </h2>
      <Alert tone="warning" title="Demonstration">
        {STUDENT_NOTICE.demonstration}
      </Alert>
      <div className="flex flex-col gap-4">
        {STUDENT_NOTICE.sections.map(({ heading, body }) => (
          <div key={heading} className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">{heading}</h3>
            {body.map((paragraph) => (
              <p key={paragraph} className="text-fg">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>
      {state.status === "error" && (
        <Alert tone={state.reason === "outdated" ? "warning" : "error"} title="Nothing was recorded" live>
          {state.message}
        </Alert>
      )}
      <form action={formAction}>
        <input type="hidden" name="version" value={STUDENT_NOTICE.version} />
        <Button type="submit" disabled={pending} aria-disabled={pending} className="w-full sm:w-auto">
          {pending && <Spinner />}
          {STUDENT_NOTICE.acknowledge}
        </Button>
      </form>
    </section>
  );
}
