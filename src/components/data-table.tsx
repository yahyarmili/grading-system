"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from "lucide-react";
import { cn } from "cn";
import { compareText } from "@/lib/collation";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./loading";
import { Pagination } from "./pagination";

export type Column<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /**
   * Value used to sort; the column is sortable when it is set.
   * null stays at the end in both directions (never counted as 0).
   * Strings compare case- and accent-insensitively.
   */
  sortValue?: (row: Row) => string | number | null;
  /** Custom comparison of two non-null values, e.g. last name then first name. */
  compare?: (a: Row, b: Row) => number;
  className?: string;
};

type Sort = { key: string; direction: "ascending" | "descending" };

/**
 * Table with sortable columns and client-side pagination. Filtering stays
 * with the caller (toolbar slot + filtered rows), so filters can later move
 * to the server without changing the table.
 * On narrow screens the table scrolls inside its own frame, never the page.
 */
export function DataTable<Row>({
  label,
  columns,
  rows,
  getRowKey,
  toolbar,
  initialSort,
  pageSize = 10,
  entityName = "rows",
  loading = false,
  empty,
}: {
  label: string;
  columns: Column<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  toolbar?: ReactNode;
  initialSort?: Sort;
  pageSize?: number;
  entityName?: string;
  loading?: boolean;
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState<Sort | undefined>(initialSort);
  const [requestedPage, setPage] = useState(1);

  // New rows (a filter changed): back to the first page.
  const [previousRows, setPreviousRows] = useState(rows);
  if (rows !== previousRows) {
    setPreviousRows(rows);
    setPage(1);
  }

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sort?.key);
    if (!sort || !column?.sortValue) return rows;
    const value = column.sortValue;
    const factor = sort.direction === "ascending" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
      const order = column.compare
        ? column.compare(a, b)
        : typeof va === "number" && typeof vb === "number"
          ? va - vb
          : compareText(String(va), String(vb));
      return order * factor;
    });
  }, [rows, columns, sort]);

  // Safety net: never point past the last page.
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(key: string) {
    setSort((current) =>
      current?.key === key && current.direction === "ascending"
        ? { key, direction: "descending" }
        : { key, direction: "ascending" },
    );
    setPage(1);
  }

  return (
    <div className="card overflow-hidden">
      {toolbar && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border-subtle px-4 py-3 md:px-6">
          {toolbar}
        </div>
      )}

      {/* Focusable so keyboard users can scroll it horizontally. */}
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-offset-[-2px]"
      >
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="border-b border-border-subtle bg-surface-muted">
              {columns.map((column) => {
                const active = sort?.key === column.key;
                const Icon = !active
                  ? ArrowUpDown
                  : sort.direction === "ascending"
                    ? ArrowUp
                    : ArrowDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? sort.direction : undefined}
                    className={cn(
                      "px-4 py-3 font-semibold whitespace-nowrap first:pl-4 md:first:pl-6",
                      column.className,
                    )}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-link"
                      >
                        {column.header}
                        <Icon
                          aria-hidden="true"
                          className={cn("size-3.5", active ? "text-fg" : "text-fg-subtle")}
                        />
                        <span className="sr-only">
                          {active
                            ? `, sorted ${sort.direction}`
                            : ", sortable"}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody aria-busy={loading || undefined}>
            {loading
              ? Array.from({ length: Math.min(pageSize, 5) }, (_, i) => (
                  <tr key={i} className="border-b border-border-subtle last:border-0">
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-4 md:first:pl-6">
                        <Skeleton className="h-4 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : visible.map((row) => (
                  <tr
                    key={getRowKey(row)}
                    className="border-b border-border-subtle last:border-0 hover:bg-surface-muted"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn("px-4 py-3 align-top md:first:pl-6", column.className)}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
        {loading && <p className="sr-only" role="status">Loading {entityName}…</p>}
        {!loading && rows.length === 0 &&
          (empty ?? (
            <EmptyState
              icon={SearchX}
              title={`No ${entityName} found`}
              description="Try other filters."
            />
          ))}
      </div>

      {!loading && rows.length > 0 && (
        <Pagination
          className="border-t border-border-subtle px-4 py-3 md:px-6"
          page={page}
          pageSize={pageSize}
          total={rows.length}
          onPageChange={setPage}
          entityName={entityName}
        />
      )}
    </div>
  );
}
