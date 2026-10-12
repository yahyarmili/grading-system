import type { ReactNode } from "react";
import { cn } from "cn";

/** Card on the page background: optional header (title + actions), body, optional footer. */
export function Card({
  title,
  description,
  actions,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card", className)}>
      {(title || actions) && (
        <header className="card-header">
          <div className="flex min-w-0 flex-col">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && (
              <p className="text-sm font-normal text-fg-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("card-body", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle px-6 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}
