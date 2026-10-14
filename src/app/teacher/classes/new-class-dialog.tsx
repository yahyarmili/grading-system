"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CLASS_NAME_MAX_LENGTH } from "@/config/provisional";
import type { CreateClassState } from "@/server/classes/classes";
import { createClassAction } from "./actions";

/** "New class" button and its dialog (CLS-01). The list refreshes after a creation. */
export function NewClassDialog({ variant = "default" }: { variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  // A new form each time the dialog opens: no error or name left from the last time.
  const [round, setRound] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setRound((r) => r + 1);
            setAnnouncement("");
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant={variant}>
            <Plus aria-hidden="true" />
            New class
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New class</DialogTitle>
            <DialogDescription>
              Students join it with a link or a code, without approval.
            </DialogDescription>
          </DialogHeader>
          <NewClassForm
            key={round}
            onCreated={(name) => {
              setOpen(false);
              setAnnouncement(`Class “${name}” created.`);
            }}
          />
        </DialogContent>
      </Dialog>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function NewClassForm({ onCreated }: { onCreated: (name: string) => void }) {
  const [state, formAction, pending] = useActionState<CreateClassState, FormData>(createClassAction, {
    status: "idle",
  });

  const created = useRef(onCreated);
  useEffect(() => {
    created.current = onCreated;
  });
  useEffect(() => {
    if (state.status === "done") created.current(state.name);
  }, [state]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.status === "error" && (
        <Alert tone="error" title="No class was created" live>
          {state.message}
        </Alert>
      )}
      {/* key: the form is reset after each submission; this gives the typed name back after a refusal. */}
      <FormField
        key={JSON.stringify(state)}
        label="Class name"
        required
        hint={`For example “Grade 10 — A”. At most ${CLASS_NAME_MAX_LENGTH} characters.`}
        error={state.status === "invalid" ? state.error : undefined}
      >
        <input
          id="class-name"
          name="name"
          className="input"
          autoComplete="off"
          maxLength={CLASS_NAME_MAX_LENGTH + 20}
          defaultValue={state.status === "invalid" ? state.name : ""}
          // Focus on open, and back on the field after a refusal.
          autoFocus
        />
      </FormField>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Creating…" : "Create class"}
        </Button>
      </DialogFooter>
    </form>
  );
}
