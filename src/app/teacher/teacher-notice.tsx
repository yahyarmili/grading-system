"use client";

import { useActionState } from "react";
import { ScrollText } from "lucide-react";
import { Alert } from "@/components/alert";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { TEACHER_NOTICE } from "@/lib/texts";
import type { AcknowledgeNoticeState } from "@/server/notices/notices";
import { acknowledgeTeacherNoticeAction } from "./actions";

// NFR-DON-04, REV-04 (E7.7): before the first access to copies, what the
// review log records and measures, who reads it, and its limit. Shown in
// place of the list or the copy: the server returns neither before the
// reading is recorded (account, date, version).

export function TeacherNotice() {
  const [state, formAction, pending] = useActionState<AcknowledgeNoticeState, FormData>(acknowledgeTeacherNoticeAction, {
    status: "idle",
  });
  return (
    <section aria-labelledby="teacher-notice-title" className="card flex max-w-3xl flex-col gap-4 p-6">
      <h2 id="teacher-notice-title" className="flex items-center gap-2 text-base font-semibold">
        <ScrollText aria-hidden="true" className="size-5 text-fg-muted" />
        {TEACHER_NOTICE.title}
      </h2>
      <p className="text-fg-muted">Read it once to see your students&apos; copies. A new version will be shown again.</p>
      <div className="flex flex-col gap-4">
        {TEACHER_NOTICE.sections.map(({ heading, body }) => (
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
        <input type="hidden" name="version" value={TEACHER_NOTICE.version} />
        <Button type="submit" disabled={pending} aria-disabled={pending} className="w-full sm:w-auto">
          {pending && <Spinner />}
          {TEACHER_NOTICE.acknowledge}
        </Button>
      </form>
    </section>
  );
}
