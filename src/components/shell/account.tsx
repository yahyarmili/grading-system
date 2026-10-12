import { Suspense } from "react";
import { Skeleton } from "@/components/loading";
import type { Role } from "@/lib/roles";
import { requireRole } from "@/server/auth/session";
import { UserBadge } from "./shell-parts";
import { SignOutButton } from "./sign-out-button";

/**
 * Signed-in user and sign-out, in the shell header. Reads the session, so it
 * streams behind Suspense while the rest of the shell renders at once.
 */
export function Account({ role, roleLabel }: { role: Role; roleLabel: string }) {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountContent role={role} roleLabel={roleLabel} />
    </Suspense>
  );
}

async function AccountContent({ role, roleLabel }: { role: Role; roleLabel: string }) {
  const user = await requireRole(role);
  return (
    <div className="flex items-center gap-2">
      <UserBadge user={user} roleLabel={roleLabel} />
      <SignOutButton />
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <Skeleton className="hidden h-8 w-24 sm:block" />
      <Skeleton className="size-9 rounded-full" />
    </div>
  );
}
