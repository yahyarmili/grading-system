import type { Metadata } from "next";
import { RubricPage } from "@/components/rubric-page";

export const metadata: Metadata = { title: "Rubric" };

// EVL-01 R2: the rubric in force, read-only (invariant 8). The same screen in both spaces.

export default function Page() {
  return <RubricPage />;
}
