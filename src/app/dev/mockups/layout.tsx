import { notFound } from "next/navigation";
import type { ReactNode } from "react";

// Mockups 1.4 and 1.5, kept for E7 (REV-01, REV-02) on fictitious data. Like
// /dev/design, they exist in development only: a production build, the
// preview included, answers 404, and no real route links to them.

export default function MockupsLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="page-container mx-auto max-w-6xl">{children}</main>;
}
