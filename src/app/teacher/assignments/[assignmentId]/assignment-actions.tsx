"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Alert } from "@/components/alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteAssignmentAction } from "../actions";

/** ASG-03: Edit always; Delete while no submission exists (R2). */
export function AssignmentActions({ id, title, locked }: { id: string; title: string; locked: boolean }) {
  const router = useRouter();
  // A refusal (a submission arrived meanwhile) stays here, next to the button.
  const [refused, setRefused] = useState<string | null>(null);
  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href={`/teacher/assignments/${id}/edit`}>
            <Pencil aria-hidden="true" />
            Edit
          </Link>
        </Button>
        {!locked && (
          <ConfirmDialog
            trigger={
              <Button variant="outline">
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            }
            title={`Delete “${title}”?`}
            description="It disappears from your list and from your students' lists. This can't be undone."
            confirmLabel="Delete"
            cancelLabel="Keep it"
            destructive
            onConfirm={async () => {
              const result = await deleteAssignmentAction(id);
              if (result.ok) router.replace("/teacher/assignments");
              else {
                setRefused(result.message);
                // The page then shows the lock, without Delete; the refusal stays.
                router.refresh();
              }
            }}
          />
        )}
      </div>
      {refused && (
        <Alert tone="error" title="Not deleted" live>
          {refused}
        </Alert>
      )}
    </div>
  );
}
