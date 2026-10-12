import type { Metadata } from "next";
import { Card } from "@/components/card";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Sign up" };

export default function Page() {
  return (
    <>
      <h1 className="sr-only">Sign up</h1>
      <Card
        title="Create your student account"
        description="Teachers get their account from an administrator."
      >
        <SignUpForm />
      </Card>
    </>
  );
}
