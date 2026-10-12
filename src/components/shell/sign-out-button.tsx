"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";
import { signOutAction } from "@/app/(auth)/actions";

/**
 * Sign-out ends with a full page load, not a client-side navigation: Next
 * keeps visited pages hidden in the document for the back button, and they
 * would still hold the signed-out user's data (AUTH-02 R4).
 */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        await signOutAction();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the full load is the point
        window.location.assign("/sign-in");
      }}
    >
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost btn-sm" disabled={pending} aria-disabled={pending}>
      <LogOut aria-hidden="true" className="size-4" />
      {/* Icon only on phones; the name stays available to screen readers. */}
      <span className="sr-only sm:not-sr-only">Sign out</span>
    </button>
  );
}
