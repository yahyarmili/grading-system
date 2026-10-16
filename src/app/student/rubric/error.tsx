"use client";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";

/** The rubric could not be shown (session unreadable, database asleep): say so, and offer to retry. */
export default function RubricError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Alert
      tone="error"
      title="The rubric could not be loaded"
      action={
        <Button variant="outline" size="sm" onClick={() => retry()}>
          Try again
        </Button>
      }
    >
      Check your connection, then try again.
    </Alert>
  );
}
