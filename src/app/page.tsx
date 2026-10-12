import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingState } from "@/components/loading";
import { roleHome } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/session";

// Entry point: the space of the signed-in role, or sign-in for a visitor.

export default function Home() {
  return (
    <main className="page-container flex flex-1 items-center justify-center">
      <Suspense fallback={<LoadingState />}>
        <Route />
      </Suspense>
    </main>
  );
}

async function Route(): Promise<null> {
  const user = await getCurrentUser();
  redirect(user ? roleHome[user.role] : "/sign-in");
}
