"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";

/** Page numbers to show: first, last, current ±1, with gaps ("…"). */
function pageItems(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    const previous = sorted[i - 1];
    // A gap hiding a single page shows that page instead.
    if (i > 0 && p - previous === 2) items.push(p - 1);
    else if (i > 0 && p - previous > 2) items.push("gap");
    items.push(p);
  });
  return items;
}

/**
 * Controlled pagination. The total ("21–30 of 47 submissions") is always shown;
 * page numbers from sm, previous / next everywhere.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  entityName = "items",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  entityName?: string;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      <p className="text-fg-muted" aria-live="polite">
        {first}–{last} of {total} {entityName}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            <span className="sr-only">Previous page</span>
          </button>
        </li>
        {pageItems(page, pageCount).map((item, i) =>
          item === "gap" ? (
            <li key={`gap-${i}`} aria-hidden="true" className="hidden px-1 text-fg-muted sm:block">
              …
            </li>
          ) : (
            <li key={item} className="hidden sm:block">
              <button
                type="button"
                className={cn(
                  "btn btn-sm min-w-8 px-2",
                  item === page ? "btn-secondary border-primary font-semibold text-link" : "btn-ghost",
                )}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
              >
                <span className="sr-only">Page </span>
                {item}
              </button>
            </li>
          ),
        )}
        <li className="px-2 text-fg-muted sm:hidden">
          Page {page} of {pageCount}
        </li>
        <li>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
            <span className="sr-only">Next page</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
