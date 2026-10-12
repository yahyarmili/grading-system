import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { Alert } from "@/components/alert";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { LoadingState, Skeleton, Spinner } from "@/components/loading";
import { LateTag, StatusTag, StudentStatusTag } from "@/components/status-tag";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { studentStatuses, submissionStatuses } from "@/lib/submission-status";
import { DialogDemo } from "./dialog-demo";
import { FormDemo } from "./form-demo";
import { PaginationDemo } from "./pagination-demo";
import { PressButton } from "./press-button";
import { TableDemo } from "./table-demo";

// Development-only showcase of the design system and reusable components.

export const metadata: Metadata = { title: "Design system" };

const sections = [
  ["foundations", "Foundations"],
  ["status", "Status tags"],
  ["cards", "Cards"],
  ["table", "Table"],
  ["form", "Form"],
  ["dialog", "Confirmation dialog"],
  ["alerts", "Alerts"],
  ["empty", "Empty state"],
  ["loading", "Loading"],
  ["pagination", "Pagination"],
  ["primitives", "Menus and tabs"],
] as const;

const swatches = [
  "bg-bg", "bg-surface", "bg-surface-muted", "bg-primary", "bg-primary-soft",
  "bg-success-bg", "bg-warning-bg", "bg-danger-bg", "bg-info-bg", "bg-neutral-bg",
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-4 flex-col gap-3">
      <h2 id={`${id}-title`} className="text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="page-container mx-auto flex max-w-6xl flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl">Design system</h1>
        <p className="text-fg-muted">
          Reusable components with fictitious data. Development only.
        </p>
        <nav aria-label="Sections">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {sections.map(([id, label]) => (
              <li key={id}>
                <a className="link" href={`#${id}`}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <Section id="foundations" title="Foundations">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Typography">
            <div className="flex flex-col gap-2">
              <p className="text-xl font-semibold">Key figure 24/32</p>
              <p className="text-lg font-semibold">Page title 20/28</p>
              <p className="text-base font-semibold">Card title 16/24</p>
              <p>Body text 14/22, used in tables, forms and paragraphs.</p>
              <p className="text-fg-muted">Secondary text for metadata.</p>
              <p className="text-xs text-fg-muted">Caption 12/20</p>
              <p>
                A sentence with an <a className="link" href="#form">inline link</a>.
              </p>
            </div>
          </Card>
          <Card title="Buttons" description="GSAP press feedback, off under reduced motion.">
            <div className="flex flex-wrap items-center gap-3">
              <PressButton className="btn btn-primary">Primary</PressButton>
              <PressButton className="btn btn-secondary">Secondary</PressButton>
              <PressButton className="btn btn-danger">Danger</PressButton>
              <PressButton className="btn btn-ghost">Ghost</PressButton>
              <PressButton className="btn btn-secondary btn-sm">Small</PressButton>
              <button className="btn btn-primary" disabled>
                Disabled
              </button>
              <button className="btn btn-primary" aria-busy="true">
                <Spinner />
                Saving…
              </button>
            </div>
          </Card>
        </div>
        <Card title="Color tokens">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {swatches.map((s) => (
              <li key={s} className="flex flex-col gap-1">
                <span className={`h-10 rounded-lg border border-border ${s}`} />
                <code className="text-xs text-fg-muted">{s.replace("bg-", "")}</code>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section id="status" title="Status tags">
        <Card title="Teacher view" description="Internal submission states (§5.5) and the late flag.">
          <ul className="flex flex-wrap gap-2">
            {submissionStatuses.map((s) => (
              <li key={s}>
                <StatusTag status={s} />
              </li>
            ))}
            <li>
              <LateTag />
            </li>
          </ul>
        </Card>
        <Card title="Student view" description="Closed list of three states; no technical state.">
          <ul className="flex flex-wrap gap-2">
            {studentStatuses.map((s) => (
              <li key={s}>
                <StudentStatusTag status={s} />
              </li>
            ))}
            <li>
              <LateTag submitted={false} />
            </li>
            <li>
              <LateTag />
            </li>
          </ul>
        </Card>
      </Section>

      <Section id="cards" title="Cards">
        <div className="grid gap-4 md:grid-cols-2">
          <Card
            title="Grade 10 — A"
            description="28 students"
            actions={<Button variant="outline" size="sm">Invite</Button>}
            footer={
              <>
                <Button variant="ghost">Archive</Button>
                <Button>Open class</Button>
              </>
            }
          >
            <p className="text-fg-muted">Card with header, actions and footer.</p>
          </Card>
          <Card>
            <p className="text-fg-muted">Card with body only.</p>
          </Card>
        </div>
      </Section>

      <Section id="table" title="Table">
        <p className="text-fg-muted">
          Sort by clicking a column header; filter by name, status or late flag.
        </p>
        <TableDemo />
      </Section>

      <Section id="form" title="Form">
        <Card title="New assignment" description="Submit empty to see the messages.">
          <FormDemo />
        </Card>
      </Section>

      <Section id="dialog" title="Confirmation dialog">
        <Card>
          <DialogDemo />
        </Card>
      </Section>

      <Section id="alerts" title="Alerts">
        <div className="flex flex-col gap-3">
          <Alert tone="info" title="Evaluation proposed by the AI">
            Review the levels before you validate. The student does not see this proposal.
          </Alert>
          <Alert tone="warning" title="Final mark differs from the calculated mark">
            The final mark differs from the mark calculated from the levels.
          </Alert>
          <Alert
            tone="error"
            title="Transcription failed"
            action={<Button variant="outline" size="sm">Retry</Button>}
          >
            The handwriting service did not answer. No other submission is affected.
          </Alert>
        </div>
      </Section>

      <Section id="empty" title="Empty state">
        <Card>
          <EmptyState
            icon={FolderOpen}
            title="No assignments yet"
            description="Create an assignment to send it to one or more of your classes."
            action={<Button>New assignment</Button>}
          />
        </Card>
        <TableDemo empty />
      </Section>

      <Section id="loading" title="Loading">
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Loading message">
            <LoadingState label="Loading submissions…" />
          </Card>
          <Card title="Skeleton">
            <div className="flex flex-col gap-3" aria-hidden="true">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </Card>
        </div>
        <TableDemo loading />
      </Section>

      <Section id="pagination" title="Pagination">
        <Card>
          <PaginationDemo />
        </Card>
      </Section>

      <Section id="primitives" title="Menus and tabs">
        <Card>
          <div className="flex flex-col gap-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="self-start">
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tabs defaultValue="text">
              <TabsList>
                <TabsTrigger value="text">Transcription</TabsTrigger>
                <TabsTrigger value="images">Images</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="text" className="pt-3 text-fg-muted">
                Transcribed text panel.
              </TabsContent>
              <TabsContent value="images" className="pt-3 text-fg-muted">
                Images panel.
              </TabsContent>
              <TabsContent value="history" className="pt-3 text-fg-muted">
                History panel.
              </TabsContent>
            </Tabs>
          </div>
        </Card>
      </Section>
    </main>
  );
}
