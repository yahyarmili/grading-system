import { ImageIcon, ScanText } from "lucide-react";
import { Tag } from "@/components/tag";
import type { AssignmentLanguage } from "@/lib/assignment";
import type { SubmissionMode } from "@/lib/submission-status";

/**
 * REV-02 R3: the student's text exactly as submitted, no correction, in the
 * assignment's language (lang, USA-03). Image copies (E9, spec 0011): the
 * transcription first, confirmed by the student or not, its mention, and the
 * pages on demand through the image route (never in the page itself).
 */
export function CopyPanel({
  text,
  mode,
  transcription,
  subject,
  language,
}: {
  text: string | null;
  mode: SubmissionMode;
  transcription: { checkedByStudent: boolean; pages: { id: string; position: number }[] } | null;
  subject: string;
  language: AssignmentLanguage;
}) {
  const words = text?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return (
    <section aria-labelledby="copy-title" className="card flex min-h-0 flex-col">
      <header className="card-header flex-wrap">
        <h2 id="copy-title" className="text-base font-semibold">
          Submission
        </h2>
        {mode === "images" && (
          <Tag tone={transcription?.checkedByStudent ? "info" : "warning"} icon={ScanText}>
            {transcription?.checkedByStudent
              ? "Transcribed automatically, checked by the student"
              : "Transcribed automatically, not checked by the student"}
          </Tag>
        )}
      </header>
      <div className="border-b border-border-subtle bg-surface-muted px-6 py-3 text-fg-muted">
        <span className="font-semibold text-fg">Task: </span>
        <span className="break-words whitespace-pre-wrap">{subject}</span>
      </div>
      {/* Own scroll on desktop, so the copy stays readable next to the evaluation. */}
      <div
        role="region"
        aria-label="Student text"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5 focus-visible:outline-offset-[-2px]"
      >
        {text === null ? (
          <p className="text-fg-muted">The transcription of this copy is not available yet.</p>
        ) : (
          <div lang={language} className="text-base leading-7 break-words whitespace-pre-wrap">
            {text}
          </div>
        )}
      </div>
      {transcription && transcription.pages.length > 0 && (
        <nav aria-label="Pages of the copy" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle px-6 py-2 text-sm">
          <span className="text-fg-muted">Pages:</span>
          {transcription.pages.map((page) => (
            <a key={page.id} href={`/api/pages/${page.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
              <ImageIcon aria-hidden="true" className="size-4" />
              Page {page.position}
            </a>
          ))}
        </nav>
      )}
      {text !== null && (
        <p className="border-t border-border-subtle px-6 py-2 text-xs text-fg-muted">
          {words} {words === 1 ? "word" : "words"}
        </p>
      )}
    </section>
  );
}
