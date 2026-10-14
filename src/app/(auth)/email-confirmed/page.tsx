import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { Card } from "@/components/card";

export const metadata: Metadata = { title: "Email confirmed" };

export default function Page() {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 text-center">
        <CircleCheck aria-hidden="true" className="size-8 text-link" />
        <h1 className="text-lg">Email confirmed</h1>
        <p>Your student account is ready. Sign in with your email and password.</p>
        <p className="text-sm text-fg-muted">If you opened a class link before signing up, you will find the class in “My classes”.</p>
        <Link className="btn btn-primary w-full" href="/sign-in">
          Sign in
        </Link>
      </div>
    </Card>
  );
}
