"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/loading";
import { joinByLinkAction } from "../actions";

/** The student joins by a POST: opening the link alone joins nothing. */
export function JoinButton({ token }: { token: string }) {
  return (
    <form action={joinByLinkAction} className="w-full">
      <input type="hidden" name="token" value={token} />
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending} aria-disabled={pending}>
      {pending && <Spinner />}
      {pending ? "Joining…" : "Join the class"}
    </button>
  );
}
