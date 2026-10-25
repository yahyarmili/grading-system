"use client";

import { ExternalLink, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AssignmentLanguage } from "@/lib/assignment";
import { pageSegments, type TextSegment, type WordChange } from "@/lib/transcription";
import type { TranscribedPage } from "@/server/data/review/copy";
import { TranscriptionText } from "./transcription-text";

/**
 * REV-02 R3 (E9, AC-13): the pages only on demand, each side by side with
 * its own reading. A page's image is requested when its tab opens, through
 * the image route (private, never cached), never before.
 */
export function PagesCompare({ pages, language }: { pages: readonly TranscribedPage[]; language: AssignmentLanguage }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Images aria-hidden="true" />
          Compare with the pages
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[90vh] flex-col sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Pages of the copy</DialogTitle>
          <DialogDescription>Each photo next to what the engine read, with the student&apos;s changes.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={pages[0]?.id} className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList aria-label="Pages">
            {pages.map((page) => (
              <TabsTrigger key={page.id} value={page.id}>
                Page {page.position}
              </TabsTrigger>
            ))}
          </TabsList>
          {pages.map((page) => (
            <TabsContent key={page.id} value={page.id} className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
              <figure className="flex min-h-0 flex-col gap-2">
                <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border-subtle bg-surface-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private page, never optimized nor cached */}
                  <img src={`/api/pages/${page.id}`} alt={`Page ${page.position} of the copy`} className="w-full" />
                </div>
                <figcaption>
                  <a href={`/api/pages/${page.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2">
                    <ExternalLink aria-hidden="true" className="size-4" />
                    Open page {page.position} full size
                  </a>
                </figcaption>
              </figure>
              <section aria-label={`Reading of page ${page.position}`} tabIndex={0} className="min-h-0 overflow-y-auto rounded-md border border-border-subtle p-4 focus-visible:outline-2">
                {page.reading === null ? (
                  <p className="text-fg-muted">This page has not been read yet.</p>
                ) : page.hasWriting === false ? (
                  <p className="text-fg-muted">No writing was found on this page.</p>
                ) : (
                  <div lang={language} className="text-base leading-7 break-words whitespace-pre-wrap">
                    <TranscriptionText segments={segmentsOf(page.reading, page.changes)} />
                  </div>
                )}
              </section>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** The page's reading with its changes; as read, without highlight, should a change not match its word. */
function segmentsOf(reading: string, changes: readonly WordChange[]): TextSegment[] {
  try {
    return pageSegments(reading, changes);
  } catch {
    return [{ text: reading }];
  }
}
