import type { Metadata } from "next";
import { RubricPage } from "@/components/rubric-page";

export const metadata: Metadata = { title: "Rubric" };

// EVL-01 R2: the rubric in force, read-only (invariant 8). The same screen in both spaces.
// ?version=: the version a result was given on, shown first (E8.3).

export default function Page({ searchParams }: PageProps<"/student/rubric">) {
  const selected = searchParams.then(({ version }) => (typeof version === "string" ? version : undefined));
  return <RubricPage selected={selected} />;
}
