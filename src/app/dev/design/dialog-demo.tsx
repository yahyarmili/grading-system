"use client";

import { useState } from "react";
import { Alert } from "@/components/alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function DialogDemo() {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <ConfirmDialog
          trigger={<Button variant="destructive">Remove student…</Button>}
          title="Remove Adam Rami from Grade 10 — A?"
          description="The student no longer receives new assignments. Their submissions stay visible to you. Only you can readmit them."
          confirmLabel="Remove student"
          destructive
          onConfirm={async () => {
            await wait(800);
            setMessage("Adam Rami was removed from Grade 10 — A.");
          }}
        />
        <ConfirmDialog
          trigger={<Button>Publish…</Button>}
          title="Publish this evaluation?"
          description="The student will see the final levels and your comments."
          confirmLabel="Publish"
          onConfirm={() => setMessage("The evaluation was published.")}
        />
      </div>
      {message && (
        <Alert tone="info" title="Done" live>
          {message}
        </Alert>
      )}
    </div>
  );
}
