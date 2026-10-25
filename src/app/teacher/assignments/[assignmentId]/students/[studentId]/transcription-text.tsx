import { Fragment } from "react";
import { ILLEGIBLE, type TextSegment } from "@/lib/transcription";

/**
 * REV-02 CA3 (E9, spec 0011): a transcription with each word the student
 * changed highlighted, the engine's word struck next to it, and every
 * `[illisible]` marker set apart (TRX-01 CA2). Said in words as well as in
 * color, for screen readers.
 */
export function TranscriptionText({ segments }: { segments: readonly TextSegment[] }) {
  return segments.map((segment, at) =>
    segment.engineWord === undefined ? (
      <Fragment key={at}>{markIllegible(segment.text)}</Fragment>
    ) : (
      <Fragment key={at}>
        <mark className="rounded-sm bg-info-bg px-0.5 font-semibold text-info-fg ring-1 ring-info-border">
          <span className="sr-only">Changed by the student to </span>
          {segment.text}
        </mark>
        <del className="ml-1 text-sm text-fg-muted" title="The word the engine read">
          <span className="sr-only">, the engine read </span>
          {segment.engineWord}
        </del>
      </Fragment>
    ),
  );
}

/** An `[illisible]` marker left as read: outlined, and named for screen readers. */
function markIllegible(text: string) {
  if (!text.includes(ILLEGIBLE)) return text;
  return text.split(ILLEGIBLE).map((part, at) => (
    <Fragment key={at}>
      {at > 0 && (
        <span className="rounded-sm border border-dashed border-warning-border bg-warning-bg px-0.5 text-warning-fg">
          {ILLEGIBLE}
          <span className="sr-only"> (unreadable)</span>
        </span>
      )}
      {part}
    </Fragment>
  ));
}
