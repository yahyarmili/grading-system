"use client";

import { useState } from "react";
import { ImageIcon, ScanText } from "lucide-react";
import { cn } from "cn";
import { Tag } from "@/components/tag";

/**
 * The student's text, exactly as submitted (no correction). For an image
 * submission: the transcription first, with its mention, and the image only
 * on demand, side by side (REV-02 R3; real images arrive in E9).
 */
export function CopyPanel({
  text,
  mode,
  instructions,
}: {
  text: string;
  mode: "text" | "image";
  instructions: string;
}) {
  const [showImage, setShowImage] = useState(false);
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <section aria-labelledby="copy-title" className="card flex min-h-0 flex-col">
      <header className="card-header flex-wrap">
        <h2 id="copy-title" className="text-base font-semibold">
          Submission
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "image" && (
            <>
              <Tag tone="info" icon={ScanText}>Transcribed automatically</Tag>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-pressed={showImage}
                onClick={() => setShowImage((s) => !s)}
              >
                <ImageIcon aria-hidden="true" className="size-4" />
                {showImage ? "Hide image" : "Show image"}
              </button>
            </>
          )}
        </div>
      </header>
      <div className="border-b border-border-subtle bg-surface-muted px-6 py-3 text-fg-muted">
        <span className="font-semibold text-fg">Task: </span>
        {instructions}
      </div>
      {/* Own scroll on desktop, so the copy stays readable next to the form. */}
      <div
        role="region"
        aria-label="Student text"
        tabIndex={0}
        className={cn(
          "grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5 focus-visible:outline-offset-[-2px]",
          showImage && "lg:grid-cols-2",
        )}
      >
        <div className="text-base leading-7 whitespace-pre-wrap">{text}</div>
        {showImage && (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-muted p-6 text-center text-fg-muted">
            <ImageIcon aria-hidden="true" className="size-8" />
            <p>Scanned page. Not available in the mockup (E9).</p>
          </div>
        )}
      </div>
      <p className="border-t border-border-subtle px-6 py-2 text-xs text-fg-muted">{words} words</p>
    </section>
  );
}
