import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { roleHome } from "@/lib/roles";

// Placeholder home page. Sign-in and sign-up arrive in E1.

export default function Home() {
  return (
    <main className="page-container flex flex-1 items-center justify-center">
      <div className="card card-body flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <GraduationCap aria-hidden="true" className="size-8 text-link" />
        <h1 className="text-lg">Grading system</h1>
        <p className="text-fg-muted">Assessment of student writing in English and French.</p>
        <p className="text-xs text-fg-muted">Sign-in is not available yet.</p>
        <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          <li><Link className="link" href={roleHome.teacher}>Teacher space</Link></li>
          <li><Link className="link" href={roleHome.student}>Student space</Link></li>
          <li><Link className="link" href={roleHome.admin}>Admin space</Link></li>
        </ul>
      </div>
    </main>
  );
}
