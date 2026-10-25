"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Camera, CircleCheck, PencilLine, RotateCw, ScanText, Send, Trash2, Undo2 } from "lucide-react";
import { Alert } from "@/components/alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { SUBMISSION_PAGES_MAX } from "@/config/decisions";
import { TRANSCRIPTION_CHANGE_MAX_GRAPHEMES } from "@/config/provisional";
import type { AssignmentLanguage } from "@/lib/assignment";
import { checkPhotoFile, PHOTO_HEAD_BYTES, type PhotoFileRefusal } from "@/lib/page-file";
import { PhotoOpenError, shrinkPhoto } from "@/lib/page-shrink";
import { normalizeStudentWord } from "@/lib/submission-text";
import { wordsOf, type PageReadingStatus } from "@/lib/transcription";
import type { OwnDraft } from "@/server/data/submissions/drafts";
import type { ConfirmImagesState } from "@/server/submissions/images";
import { confirmImagesAction, deletePageAction, readPageAction, reorderPagesAction } from "./actions";
import { NoNameInstruction } from "./text-field";

// SUB-03, TRX-01 (E9, spec 0011): the student photographs their pages, each
// is checked and shrunk here, uploaded to their draft and read by the AI.
// They order, retake or delete pages, fix a misread word once, word by word
// (Q4), then send. Only then is the submission created, on the text the
// server rebuilds from the readings and the changes. Unsaved word changes
// live in this state only: a reload loses them, by design. When a reading
// fails, they may send the pages unchecked: the pipeline reads them (AC-7).

type Page = {
  id: string;
  status: PageReadingStatus | "reading";
  text: string | null;
  hasWriting: boolean | null;
  /** A local preview, before a reload; the image route after it. */
  preview: string;
  error?: string;
};

/** The student's word in place of the engine's, by word index, per page. */
type Changes = Record<string, Record<number, { engineWord: string; studentWord: string }>>;

/** An upload that did not reach the server: tried again with the same id, it stores one page (AC-3). */
type PendingUpload = { jpeg: Blob; uploadRequestId: string; replacesPageId?: string };

const UPLOAD_MESSAGES: Record<string, string> = {
  tooLarge: "This photo is too large, even once shrunk. Take it again from closer.",
  notJpeg: "This file could not be read as a photo.",
  tooManyPages: `You can send ${SUBMISSION_PAGES_MAX} pages at most. Delete or retake a page instead.`,
  badPosition: "This page could not be added. Reload the page.",
};

const FILE_MESSAGES: Record<PhotoFileRefusal, string> = {
  pdf: "A PDF can't be sent. Take a photo of each page instead (JPEG, PNG, WebP or HEIC).",
  format: "This file is not a photo the app accepts. Use a JPEG, PNG, WebP or HEIC photo.",
  mismatch: "This file's name does not match its content. Take the photo again, or save it again as a JPEG.",
  tooLarge: "This photo is larger than 20 MB. Take it again with a lower quality setting.",
  empty: "This file is empty. Choose the photo again.",
};

const ILLEGIBLE = "[illisible]";

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
  const router = useRouter();
  const [draftId, setDraftId] = useState(draft?.id ?? null);
  // Kept in position order: a page's position is its index plus one.
  const [pages, setPages] = useState<Page[]>(() => draft?.pages.map((p) => ({ ...p, preview: `/api/pages/${p.id}` })) ?? []);
  const [changes, setChanges] = useState<Changes>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmImagesState>({ status: "idle" });
  const [sending, startSending] = useTransition();
  const [editing, startEditing] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const retakeRef = useRef<HTMLInputElement>(null);
  const retakeTarget = useRef<string | null>(null);

  const update = (id: string, change: Partial<Page>) => setPages((all) => all.map((p) => (p.id === id ? { ...p, ...change } : p)));
  const dropChanges = (id: string) =>
    setChanges(({ [id]: _dropped, ...kept }) => {
      void _dropped;
      return kept;
    });

  async function read(id: string) {
    update(id, { status: "reading", error: undefined });
    const state = await readPageAction(id);
    if (state.status === "read") update(id, { status: "read", text: state.text, hasWriting: state.hasWriting });
    else update(id, { status: "failed", error: state.message });
  }

  /** Sends one shrunk page; kept for a retry when the network fails. */
  async function upload(next: PendingUpload) {
    setUploadError(null);
    setPendingUpload(null);
    setUploading(true);
    try {
      const response = await fetch(`/api/drafts/${assignmentId}/pages`, {
        method: "POST",
        headers: {
          "Content-Type": "image/jpeg",
          "x-upload-request-id": next.uploadRequestId,
          ...(next.replacesPageId && { "x-replaces-page-id": next.replacesPageId }),
        },
        body: next.jpeg,
      });
      if (response.status === 409) {
        // AC-17: a newer notice is in force; the page shows it again.
        router.refresh();
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { reason?: string } | null;
        setUploadError(UPLOAD_MESSAGES[body?.reason ?? ""] ?? "This page could not be added. You may no longer be able to submit.");
        return;
      }
      const { draftId: id, pageId, position } = (await response.json()) as { draftId: string; pageId: string; position: number };
      // The draft exists from the first page on.
      setDraftId(id);
      const page: Page = { id: pageId, status: "pending", text: null, hasWriting: null, preview: URL.createObjectURL(next.jpeg) };
      setPages((all) => {
        const rest = all.filter((p) => p.id !== pageId && p.id !== next.replacesPageId);
        return [...rest.slice(0, position - 1), page, ...rest.slice(position - 1)];
      });
      if (next.replacesPageId) dropChanges(next.replacesPageId);
      await read(pageId);
    } catch {
      setPendingUpload(next);
      setUploadError("The page could not be sent. Check your connection, then try again.");
    } finally {
      setUploading(false);
    }
  }

  async function choosePhoto(file: File, replacesPageId?: string) {
    setUploadError(null);
    setPendingUpload(null);
    const head = new Uint8Array(await file.slice(0, PHOTO_HEAD_BYTES).arrayBuffer());
    const refusal = checkPhotoFile(file.name, file.size, head);
    if (refusal) {
      setUploadError(FILE_MESSAGES[refusal]);
      return;
    }
    let jpeg: Blob;
    setUploading(true);
    try {
      jpeg = await shrinkPhoto(file);
    } catch (error) {
      setUploading(false);
      setUploadError(error instanceof PhotoOpenError ? "This browser cannot open this photo. Try a JPEG or PNG photo." : "This photo could not be opened.");
      return;
    }
    await upload({ jpeg, uploadRequestId: crypto.randomUUID(), replacesPageId });
  }

  function move(index: number, by: -1 | 1) {
    if (!draftId) return;
    const order = [...pages];
    [order[index], order[index + by]] = [order[index + by], order[index]];
    setEditError(null);
    startEditing(async () => {
      const state = await reorderPagesAction(draftId, order.map((p) => p.id));
      if (state.status === "done") setPages(order);
      else setEditError(state.message);
    });
  }

  async function remove(id: string) {
    setEditError(null);
    const state = await deletePageAction(id);
    if (state.status === "done") {
      setPages((all) => all.filter((p) => p.id !== id));
      dropChanges(id);
    } else setEditError(state.message);
  }

  function retake(id: string) {
    retakeTarget.current = id;
    retakeRef.current?.click();
  }

  const setChange = (pageId: string, wordIndex: number, change: { engineWord: string; studentWord: string } | null) =>
    setChanges((all) => {
      const page = { ...all[pageId] };
      if (change) page[wordIndex] = change;
      else delete page[wordIndex];
      return { ...all, [pageId]: page };
    });

  const allRead = pages.length > 0 && pages.every((p) => p.status === "read");
  // AC-6: every page read, none with writing: the student is warned, and may still send.
  const noWriting = allRead && pages.every((p) => !p.hasWriting);
  // AC-7: a reading failed (or the AI is closed): the pages may go as they are, read after sending.
  const someFailed = pages.some((p) => p.status === "failed") && !pages.some((p) => p.status === "reading");
  const changeList = pages.flatMap((page) =>
    Object.entries(changes[page.id] ?? {}).map(([wordIndex, change]) => ({ pageId: page.id, wordIndex: Number(wordIndex), ...change })),
  );
  const busy = uploading || editing || sending;

  function send(mode: "checked" | "unchecked") {
    if (!draftId) return;
    startSending(async () => {
      // Unchecked: no change goes, the pages left are read after sending (AC-7).
      const sent = mode === "checked" ? changeList : [];
      setConfirm(await confirmImagesAction({ assignmentId, draftId, contentVersion, requestId, changes: sent, mode }));
    });
  }

  const fileInput = (ref: React.RefObject<HTMLInputElement | null>, id: string, onFile: (file: File) => void) => (
    <input
      ref={ref}
      id={id}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
      className="sr-only"
      tabIndex={-1}
      disabled={busy}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void onFile(file);
      }}
    />
  );

  return (
    <section aria-labelledby="your-pages-title" className="card flex flex-col gap-4 p-4">
      <h2 id="your-pages-title" className="text-base font-semibold">
        Send photos of your pages
      </h2>
      <NoNameInstruction />
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-muted">
        <li>Up to {SUBMISSION_PAGES_MAX} pages, one photo each, in the order you wrote them.</li>
        <li>Each page is read by the AI exactly as written: nothing is corrected.</li>
        <li>If the AI misread a word, tap it and type what you actually wrote. Fix only reading mistakes, not your own.</li>
        <li>Nothing is sent until you press Send.</li>
      </ul>

      {pages.length > 0 && (
        <ol aria-label="Your pages" className="flex flex-col gap-4">
          {pages.map((page, index) => (
            <PageCard
              key={page.id}
              page={page}
              position={index + 1}
              count={pages.length}
              language={language}
              changes={changes[page.id] ?? {}}
              busy={busy}
              onRead={() => read(page.id)}
              onMove={(by) => move(index, by)}
              onRetake={() => retake(page.id)}
              onDelete={() => remove(page.id)}
              onChange={(wordIndex, change) => setChange(page.id, wordIndex, change)}
            />
          ))}
        </ol>
      )}
      {fileInput(retakeRef, "page-retake", (file) => {
        const target = retakeTarget.current;
        retakeTarget.current = null;
        if (target) void choosePhoto(file, target);
      })}

      {editError && (
        <Alert tone="error" title="Your pages were not changed" live>
          {editError}
        </Alert>
      )}

      {uploadError && (
        <Alert tone="error" title="Page not added" live>
          <div className="flex flex-col gap-2">
            <p>{uploadError}</p>
            {pendingUpload && (
              <Button variant="outline" size="sm" onClick={() => upload(pendingUpload)} disabled={busy} className="self-start">
                <RotateCw aria-hidden="true" />
                Try again
              </Button>
            )}
          </div>
        </Alert>
      )}

      {pages.length < SUBMISSION_PAGES_MAX ? (
        <div>
          {fileInput(fileRef, "page-photo", (file) => choosePhoto(file))}
          <Button variant="outline" asChild className="w-full sm:w-auto" aria-disabled={busy}>
            <label htmlFor="page-photo" className={busy ? "pointer-events-none opacity-60" : "cursor-pointer"}>
              {uploading ? <Spinner /> : <Camera aria-hidden="true" />}
              {uploading ? "Adding the page…" : pages.length === 0 ? "Add a photo of your first page" : `Add a photo of page ${pages.length + 1}`}
            </label>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">
          You have {SUBMISSION_PAGES_MAX} pages, the most you can send. To change one, retake or delete it.
        </p>
      )}

      {confirm.status === "error" && (
        <Alert tone="error" title="Your pages were not sent" live>
          {confirm.message}
        </Alert>
      )}

      {pages.length > 0 && (
        <div className="flex flex-col gap-2">
          {!allRead && !someFailed && <p className="text-sm text-fg-muted">Every page must be read before you send.</p>}
          {noWriting && (
            <Alert tone="warning" title="No writing found" live>
              The AI found no writing on your pages. Check that you photographed the right pages. If you send them as they are, the
              AI cannot propose a mark: your teacher looks at your pages instead.
            </Alert>
          )}
          {changeList.length > 0 && (
            <p className="text-sm text-fg-muted">
              You changed {changeList.length} {changeList.length === 1 ? "word" : "words"}. Your teacher sees each change next to what the AI read.
            </p>
          )}
          {someFailed ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-fg-muted">
                A page could not be read. Try reading it again, or send your pages without checking the reading.
              </p>
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={busy || draftId === null} className="w-full sm:w-auto sm:self-start">
                    {sending ? <Spinner /> : <Send aria-hidden="true" />}
                    {sending ? "Sending…" : "Send without checking the reading"}
                  </Button>
                }
                title="Send your pages without checking the reading?"
                description={`The pages not read yet are read after you send them, and you cannot check that reading. Your teacher sees that you did not check it.${changeList.length > 0 ? " The words you changed are not sent." : ""}`}
                confirmLabel="Send my pages"
                onConfirm={async () => send("unchecked")}
              />
            </div>
          ) : (
            <Button onClick={() => send("checked")} disabled={!allRead || busy || draftId === null} className="w-full sm:w-auto sm:self-start">
              {sending ? <Spinner /> : <CircleCheck aria-hidden="true" />}
              {sending ? "Sending…" : "I checked the reading: send my pages"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function PageCard({
  page,
  position,
  count,
  language,
  changes,
  busy,
  onRead,
  onMove,
  onRetake,
  onDelete,
  onChange,
}: {
  page: Page;
  position: number;
  count: number;
  language: AssignmentLanguage;
  changes: Changes[string];
  busy: boolean;
  onRead: () => void;
  onMove: (by: -1 | 1) => void;
  onRetake: () => void;
  onDelete: () => Promise<void>;
  onChange: (wordIndex: number, change: { engineWord: string; studentWord: string } | null) => void;
}) {
  const [editingWord, setEditingWord] = useState<number | null>(null);
  const reading = page.status === "reading";
  const words = page.status === "read" && page.hasWriting && page.text !== null ? wordsOf(page.text) : [];

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Page {position}</h3>
        <PageStatus status={page.status} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a private page, never optimized nor cached */}
      <img src={page.preview} alt={`Photo of page ${position}`} className="max-h-72 w-full rounded-md border border-border-subtle object-contain" />

      {page.status === "read" &&
        (page.hasWriting && page.text !== null ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-fg-muted">What the AI read</span>
            <ReadingText
              text={page.text}
              language={language}
              changes={changes}
              editingWord={editingWord}
              onWord={(index) => setEditingWord(editingWord === index ? null : index)}
            />
            {editingWord !== null && words[editingWord] !== undefined && (
              <WordEditor
                key={editingWord}
                engineWord={words[editingWord]}
                current={changes[editingWord]?.studentWord}
                language={language}
                onSave={(studentWord) => {
                  onChange(editingWord, studentWord === words[editingWord] ? null : { engineWord: words[editingWord], studentWord });
                  setEditingWord(null);
                }}
                onUndo={() => {
                  onChange(editingWord, null);
                  setEditingWord(null);
                }}
                onCancel={() => setEditingWord(null)}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">No writing was found on this page.</p>
        ))}
      {page.status === "failed" && (
        <Alert tone="warning" title="Not read" live>
          {page.error ?? "The page could not be read."}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {(page.status === "pending" || page.status === "failed") && (
          <Button variant="outline" size="sm" onClick={onRead} disabled={busy}>
            <RotateCw aria-hidden="true" />
            Read this page
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => onMove(-1)} disabled={busy || reading || position === 1}>
          <ArrowUp aria-hidden="true" />
          Move up<span className="sr-only">: page {position}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => onMove(1)} disabled={busy || reading || position === count}>
          <ArrowDown aria-hidden="true" />
          Move down<span className="sr-only">: page {position}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onRetake} disabled={busy || reading}>
          <Camera aria-hidden="true" />
          Retake<span className="sr-only"> page {position}</span>
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" disabled={busy || reading}>
              <Trash2 aria-hidden="true" />
              Delete<span className="sr-only"> page {position}</span>
            </Button>
          }
          title={`Delete page ${position}?`}
          description="The photo and its reading are removed from your pages. The pages after it move up one place."
          confirmLabel="Delete the page"
          destructive
          onConfirm={onDelete}
        />
      </div>
    </li>
  );
}

/**
 * The engine's reading, its whitespace and line breaks kept; each word a
 * button that opens its editor. A changed word shows the engine's word struck
 * through, then the student's; `[illisible]` is marked in words, never by
 * color alone.
 */
function ReadingText({
  text,
  language,
  changes,
  editingWord,
  onWord,
}: {
  text: string;
  language: AssignmentLanguage;
  changes: Changes[string];
  editingWord: number | null;
  onWord: (index: number) => void;
}) {
  let index = 0;
  const parts = text.split(/(\s+)/).map((part, at) => {
    if (part === "" || /^\s+$/.test(part)) return part;
    const wordIndex = index++;
    const change = changes[wordIndex];
    const illegible = part === ILLEGIBLE;
    return (
      <button
        key={at}
        type="button"
        onClick={() => onWord(wordIndex)}
        aria-pressed={editingWord === wordIndex}
        className={`rounded-sm px-0.5 text-left underline decoration-dotted decoration-fg-subtle underline-offset-4 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-focus aria-pressed:bg-primary-soft ${illegible ? "border border-dashed border-warning-border bg-warning-bg text-warning-fg" : ""}`}
      >
        {change ? (
          <>
            <del className="text-fg-muted">{part}</del>{" "}
            <ins className="font-semibold no-underline">
              <span className="sr-only">changed to </span>
              {change.studentWord}
            </ins>
          </>
        ) : illegible ? (
          <>
            {part}
            <span className="sr-only"> (unreadable)</span>
          </>
        ) : (
          part
        )}
      </button>
    );
  });
  return (
    <p lang={language} className="rounded-md border border-border-subtle bg-surface-muted p-3 break-words whitespace-pre-wrap">
      {parts}
    </p>
  );
}

/** One word of the reading replaced by what the student wrote: one or more words, no line break. */
function WordEditor({
  engineWord,
  current,
  language,
  onSave,
  onUndo,
  onCancel,
}: {
  engineWord: string;
  current?: string;
  language: AssignmentLanguage;
  onSave: (studentWord: string) => void;
  onUndo: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(current ?? (engineWord === ILLEGIBLE ? "" : engineWord));
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      noValidate
      className="flex flex-col gap-2 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const word = normalizeStudentWord(value);
        if (word === null) {
          setError(`Type what you wrote, from 1 to ${TRANSCRIPTION_CHANGE_MAX_GRAPHEMES} characters.`);
          return;
        }
        onSave(word);
      }}
    >
      <label htmlFor={id} className="text-sm font-semibold">
        What you wrote in place of “{engineWord}”
      </label>
      <input
        id={id}
        lang={language}
        className="input"
        value={value}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={error !== null || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger-fg">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">
          <PencilLine aria-hidden="true" />
          Keep my word
        </Button>
        {current !== undefined && (
          <Button type="button" variant="outline" size="sm" onClick={onUndo}>
            <Undo2 aria-hidden="true" />
            Back to the AI&apos;s reading
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
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
