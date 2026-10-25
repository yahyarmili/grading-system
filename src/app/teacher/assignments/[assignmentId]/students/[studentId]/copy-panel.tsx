import { ScanText } from "lucide-react";
import { Tag } from "@/components/tag";
import type { AssignmentLanguage } from "@/lib/assignment";
import type { SubmissionMode } from "@/lib/submission-status";
import { assembleSegments, type TextSegment } from "@/lib/transcription";
import type { TranscribedPage } from "@/server/data/review/copy";
import { PagesCompare } from "./pages-compare";
import { TranscriptionText } from "./transcription-text";

/**
 * REV-02 R3: the student's text exactly as submitted, no correction, in the
 * assignment's language (lang, USA-03). Image copies (E9, spec 0011): the
 * transcription first, confirmed by the student or not, its mention, the
 * words the student changed next to the engine's (REV-02 CA3), and the pages
 * on demand, side by side with their reading (never in the page itself).
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
  transcription: { checkedByStudent: boolean; pages: TranscribedPage[] } | null;
  subject: string;
  language: AssignmentLanguage;
}) {
  const words = text?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const segments = transcription && text !== null ? highlighted(transcription.pages, text) : null;
  const changed = transcription?.pages.reduce((sum, page) => sum + page.changes.length, 0) ?? 0;
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
            {segments ? <TranscriptionText segments={segments} /> : text}
          </div>
        )}
      </div>
      {(text !== null || (transcription && transcription.pages.length > 0)) && (
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle px-6 py-2">
          {text !== null && (
            <p className="text-xs text-fg-muted">
              {words} {words === 1 ? "word" : "words"}
              {changed > 0 && `, ${changed} changed by the student`}
            </p>
          )}
          {transcription && transcription.pages.length > 0 && <PagesCompare pages={transcription.pages} language={language} />}
        </footer>
      )}
    </section>
  );
}

/**
 * The text cut where the student changed a word, rebuilt from the pages as
 * the server assembled it; null (the text shown as is) when a page is not
 * read yet or the pieces would not give back the text evaluated.
 */
function highlighted(pages: readonly TranscribedPage[], text: string): TextSegment[] | null {
  if (pages.some((page) => page.reading === null || page.hasWriting === null)) return null;
  try {
    const segments = assembleSegments(pages.map((page) => ({ position: page.position, hasWriting: page.hasWriting === true, text: page.reading ?? "", changes: page.changes })));
    return segments.map((segment) => segment.text).join("") === text ? segments : null;
  } catch {
    // A change whose engine word does not match its page: the text as evaluated, without highlight.
    return null;
  }
}
