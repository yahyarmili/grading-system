"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, CircleCheck, RotateCw, ScanText } from "lucide-react";
import { Alert } from "@/components/alert";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { SUBMISSION_PAGES_MAX } from "@/config/decisions";
import type { AssignmentLanguage } from "@/lib/assignment";
import { PhotoOpenError, shrinkPhoto } from "@/lib/page-shrink";
import type { PageReadingStatus } from "@/lib/transcription";
import type { OwnDraft } from "@/server/data/submissions/drafts";
import type { ConfirmImagesState } from "@/server/submissions/images";
import { confirmImagesAction, readPageAction } from "./actions";
import { NoNameInstruction } from "./text-field";

// SUB-03, TRX-01 (E9, spec 0011): the student photographs their pages, each
// is shrunk here, uploaded to their draft and read by the AI; they check the
// reading, then send. Only then is the submission created. A thin first
// version: pages are added in order; reordering, deleting, retaking and
// word changes come with the next step.

type Page = {
  id: string;
  position: number;
  status: PageReadingStatus | "reading";
  text: string | null;
  hasWriting: boolean | null;
  /** A local preview, before a reload; the image route after it. */
  preview: string;
  error?: string;
};

const UPLOAD_MESSAGES: Record<string, string> = {
  tooLarge: "This photo is too large, even once shrunk. Take it again from closer.",
  notJpeg: "This file could not be read as a photo.",
  tooManyPages: `You can send ${SUBMISSION_PAGES_MAX} pages at most.`,
  badPosition: "This page could not be added. Reload the page.",
  noticeNotRead: "Read the notice about your data before you add a page.",
};

export function ImagesSection({
  assignmentId,
  contentVersion,
  requestId,
  language,
  draft,
}: {
  assignmentId: string;
  contentVersion: number;
  /** One per page shown: a resent confirmation is the same submission. */
  requestId: string;
  language: AssignmentLanguage;
  draft: OwnDraft | null;
}) {
  const [draftId, setDraftId] = useState(draft?.id ?? null);
  const [pages, setPages] = useState<Page[]>(
    () => draft?.pages.map((p) => ({ ...p, preview: `/api/pages/${p.id}` })) ?? [],
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmImagesState>({ status: "idle" });
  const [sending, startSending] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (id: string, change: Partial<Page>) => setPages((all) => all.map((p) => (p.id === id ? { ...p, ...change } : p)));

  async function read(id: string) {
    update(id, { status: "reading", error: undefined });
    const state = await readPageAction(id);
    if (state.status === "read") update(id, { status: "read", text: state.text, hasWriting: state.hasWriting });
    else update(id, { status: "failed", error: state.message });
  }

  async function addPhoto(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const jpeg = await shrinkPhoto(file);
      const response = await fetch(`/api/drafts/${assignmentId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", "x-upload-request-id": crypto.randomUUID() },
        body: jpeg,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { reason?: string } | null;
        setUploadError(UPLOAD_MESSAGES[body?.reason ?? ""] ?? "This page could not be added. You may no longer be able to submit.");
        return;
      }
      const page = (await response.json()) as { draftId: string; pageId: string; position: number };
      // The draft exists from the first page on.
      setDraftId(page.draftId);
      const { pageId, position } = page;
      setPages((all) => [...all, { id: pageId, position, status: "pending", text: null, hasWriting: null, preview: URL.createObjectURL(jpeg) }]);
      await read(pageId);
    } catch (error) {
      setUploadError(error instanceof PhotoOpenError ? "This browser cannot open this photo. Try a JPEG or PNG photo." : "The page could not be sent. Check your connection, then try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const allRead = pages.length > 0 && pages.every((p) => p.status === "read");

  function send() {
    if (!draftId) return;
    startSending(async () => {
      setConfirm(await confirmImagesAction({ assignmentId, draftId, contentVersion, requestId, changes: [] }));
    });
  }

  return (
    <section aria-labelledby="your-pages-title" className="card flex flex-col gap-4 p-4">
      <h2 id="your-pages-title" className="text-base font-semibold">
        Send photos of your pages
      </h2>
      <NoNameInstruction />
      <p className="text-sm text-fg-muted">
        Each page is read by the AI. Check what it read before you send: nothing is sent until you do.
      </p>

      {pages.length > 0 && (
        <ol className="flex flex-col gap-4">
          {[...pages]
            .sort((a, b) => a.position - b.position)
            .map((page) => (
              <li key={page.id} className="flex flex-col gap-3 rounded-lg border border-border-subtle p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Page {page.position}</h3>
                  <PageStatus status={page.status} />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- a private page, never optimized nor cached */}
                <img src={page.preview} alt={`Photo of page ${page.position}`} className="max-h-72 w-full rounded-md border border-border-subtle object-contain" />
                {page.status === "read" &&
                  (page.hasWriting ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold text-fg-muted">What the AI read</span>
                      <p lang={language} className="rounded-md border border-border-subtle bg-surface-muted p-3 break-words whitespace-pre-wrap">
                        {page.text}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-fg-muted">No writing was found on this page.</p>
                  ))}
                {page.status === "failed" && (
                  <Alert tone="warning" title="Not read" live>
                    {page.error ?? "The page could not be read."}
                  </Alert>
                )}
                {(page.status === "pending" || page.status === "failed") && (
                  <Button variant="outline" onClick={() => read(page.id)} className="w-full sm:w-auto sm:self-start">
                    <RotateCw aria-hidden="true" />
                    Read this page
                  </Button>
                )}
              </li>
            ))}
        </ol>
      )}

      {uploadError && (
        <Alert tone="error" title="Page not added" live>
          {uploadError}
        </Alert>
      )}

      {pages.length < SUBMISSION_PAGES_MAX && (
        <div>
          <input
            ref={fileRef}
            id="page-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void addPhoto(file);
            }}
          />
          <Button variant="outline" asChild className="w-full sm:w-auto" aria-disabled={uploading}>
            <label htmlFor="page-photo" className={uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}>
              {uploading ? <Spinner /> : <Camera aria-hidden="true" />}
              {uploading ? "Adding the page…" : pages.length === 0 ? "Add a photo of your first page" : "Add a photo of the next page"}
            </label>
          </Button>
        </div>
      )}

      {confirm.status === "error" && (
        <Alert tone="error" title="Your pages were not sent" live>
          {confirm.message}
        </Alert>
      )}

      {pages.length > 0 && (
        <Button onClick={send} disabled={!allRead || sending || draftId === null} className="w-full sm:w-auto sm:self-start">
          {sending ? <Spinner /> : <CircleCheck aria-hidden="true" />}
          {sending ? "Sending…" : "I checked the reading: send my pages"}
        </Button>
      )}
    </section>
  );
}

/** The page's reading state, in words and an icon, never color alone. */
function PageStatus({ status }: { status: Page["status"] }) {
  const label = { pending: "To read", reading: "Reading…", read: "Read", failed: "Not read" }[status];
  return (
    <span className="inline-flex items-center gap-1 text-sm text-fg-muted">
      {status === "reading" ? <Spinner /> : <ScanText aria-hidden="true" className="size-4" />}
      {label}
    </span>
  );
}
