import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { Card } from "@/components/card";

export const metadata: Metadata = { title: "Email confirmed" };

export default function Page() {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 text-center">
        <CircleCheck aria-hidden="true" className="size-8 text-link" />
        <h1 className="text-lg">Email confirmed</h1>
        <p>Your student account is ready. You can now sign in with your email and password.</p>
      </div>
    </Card>
  );
}
