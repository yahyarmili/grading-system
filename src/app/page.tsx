import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PressButton } from "./press-button";

// Temporary preview of the design foundations (step 1.1).
// Replaced by the role shells (1.2) and the /dev/design showcase (1.3).

const swatches = [
  { name: "bg", className: "bg-bg" },
  { name: "surface", className: "bg-surface" },
  { name: "surface-muted", className: "bg-surface-muted" },
  { name: "primary", className: "bg-primary" },
  { name: "primary-soft", className: "bg-primary-soft" },
  { name: "success-bg", className: "bg-success-bg" },
  { name: "warning-bg", className: "bg-warning-bg" },
  { name: "danger-bg", className: "bg-danger-bg" },
  { name: "info-bg", className: "bg-info-bg" },
];

export default function Home() {
  return (
    <main className="page-container mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg">Design foundations</h1>
        <p className="text-fg-muted">
          Tokens, type scale, buttons, links and fields. Temporary page.
        </p>
      </header>

      <section className="card" aria-labelledby="type-title">
        <h2 id="type-title" className="card-header">
          Typography
        </h2>
        <div className="card-body flex flex-col gap-2">
          <p className="text-2xl font-semibold">16.5 / 20</p>
          <p className="text-xl font-semibold">Key figure 24/32</p>
          <p className="text-lg font-semibold">Page title 20/28</p>
          <p className="text-base font-semibold">Card title 16/24</p>
          <p>Body text 14/22, used in tables, forms and paragraphs.</p>
          <p className="text-fg-muted">Secondary text for metadata.</p>
          <p className="text-xs text-fg-muted">Caption 12/20</p>
          <p>
            A sentence with an <a className="link" href="#fields">inline link</a>{" "}
            to the fields below.
          </p>
        </div>
      </section>

      <section className="card" aria-labelledby="buttons-title">
        <h2 id="buttons-title" className="card-header">
          Buttons
        </h2>
        <div className="card-body flex flex-wrap items-center gap-3">
          <PressButton className="btn btn-primary">Publish</PressButton>
          <PressButton className="btn btn-secondary">Save draft</PressButton>
          <PressButton className="btn btn-danger">Remove student</PressButton>
          <PressButton className="btn btn-ghost">Cancel</PressButton>
          <PressButton className="btn btn-secondary btn-sm">Small</PressButton>
          <button className="btn btn-primary" disabled>
            Disabled
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="fields-title" id="fields">
        <h2 id="fields-title" className="card-header">
          Fields
        </h2>
        <form className="card-body grid gap-4 md:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor="title">
              Assignment title
            </label>
            <input
              id="title"
              className="input"
              placeholder="e.g. My last holiday"
              aria-describedby="title-hint"
            />
            <p id="title-hint" className="field-hint">
              Students see this title.
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              defaultValue="not-an-email"
              aria-invalid="true"
              aria-describedby="email-error"
            />
            <p id="email-error" className="field-error">
              <span aria-hidden="true">⚠</span>
              <span>Error: enter a valid email address.</span>
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="language">
              Language
            </label>
            <select id="language" className="input">
              <option>English</option>
              <option>French</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="disabled">
              Disabled
            </label>
            <input id="disabled" className="input" disabled value="Read only" />
          </div>
          <div className="field md:col-span-2">
            <label className="label" htmlFor="comment">
              Comment
            </label>
            <textarea id="comment" className="input" />
          </div>
        </form>
      </section>

      <section className="card" aria-labelledby="primitives-title">
        <h2 id="primitives-title" className="card-header">
          Accessible primitives
        </h2>
        <div className="card-body flex flex-col gap-6">
          <div className="flex flex-wrap items-end gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">Remove student…</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove this student?</DialogTitle>
                  <DialogDescription>
                    The student leaves the class. Only you can readmit them.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="destructive">Remove</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Actions</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="field">
              <label className="label" id="criterion-label">
                Criterion
              </label>
              <Select defaultValue="organisation">
                <SelectTrigger aria-labelledby="criterion-label" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Task fulfilment</SelectItem>
                  <SelectItem value="organisation">Organisation</SelectItem>
                  <SelectItem value="vocabulary">Vocabulary</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
      </section>

      <section className="card" aria-labelledby="colors-title">
        <h2 id="colors-title" className="card-header">
          Color tokens
        </h2>
        <ul className="card-body grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {swatches.map((s) => (
            <li key={s.name} className="flex flex-col gap-1">
              <span
                className={`h-12 rounded-lg border border-border ${s.className}`}
              />
              <span className="text-xs text-fg-muted">{s.name}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
