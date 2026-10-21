import { History as HistoryIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/dates";
import { historyOf } from "@/lib/review-journal";
import { getActor } from "@/server/auth/session";
import { listCopyJournal } from "@/server/data/review/journal";

// REV-04 R3 (E7.7): the corrector reads the log of their copy, newest first:
// who, when (with the time zone), what changed from what to what. Read only:
// there is nothing to change or delete. The AI proposal stays readable in
// the form above, unchanged (invariant 5).

export async function CopyHistory({ submissionId }: { submissionId: string }) {
  const entries = await listCopyJournal(await getActor(), submissionId);
  const items = historyOf(entries ?? []);
  return (
    <section aria-labelledby="history-title" className="card">
      <header className="card-header">
        <h2 id="history-title" className="text-base font-semibold">
          History
        </h2>
        <span className="text-fg-muted">
          {items.length} {items.length === 1 ? "entry" : "entries"}
        </span>
      </header>
      {items.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="Nothing recorded yet" description="Opening this copy and each change you make appear here." />
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col gap-2 px-6 py-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold">{item.label}</span>
                <span className="text-fg-muted">
                  {item.author} · <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                  {item.versionNumber !== null && item.versionNumber > 1 && <> · text version {item.versionNumber}</>}
                </span>
              </div>
              {item.changes.length > 0 && (
                <table className="w-full table-fixed text-left text-sm">
                  <caption className="sr-only">Changes: field, before, after</caption>
                  <thead className="text-xs text-fg-muted">
                    <tr>
                      <th scope="col" className="w-1/4 py-1 pr-3 font-medium">
                        Field
                      </th>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        Before
                      </th>
                      <th scope="col" className="py-1 font-medium">
                        After
                      </th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {item.changes.map((change) => (
                      <tr key={change.field} className="border-t border-border">
                        <th scope="row" className="py-1.5 pr-3 font-medium">
                          {change.label}
                        </th>
                        <td className="py-1.5 pr-3 break-words whitespace-pre-line text-fg-muted">
                          <del className="no-underline">{change.before}</del>
                        </td>
                        <td className="py-1.5 break-words whitespace-pre-line">
                          <ins className="no-underline">{change.after}</ins>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
