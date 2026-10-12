import { GraduationCap } from "lucide-react";

/** Screens without a session: one narrow column, centered, phone first. */
export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <main className="page-container flex flex-1 flex-col items-center justify-center gap-6 py-10">
      <p className="flex items-center gap-2 font-semibold">
        <GraduationCap aria-hidden="true" className="size-6 text-link" />
        Grading system
      </p>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
