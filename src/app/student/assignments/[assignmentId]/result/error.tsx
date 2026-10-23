"use client";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";

/** The result could not be loaded (database asleep or unreachable): say so, nothing else, and offer to retry. */
export default function ResultError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Alert
      tone="error"
      title="Your result could not be loaded"
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
