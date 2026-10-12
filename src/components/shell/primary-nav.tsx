import { Suspense, type ComponentProps } from "react";
import { NavLinks, NavLinksFallback } from "./nav-links";

/**
 * Navigation links wrapped in Suspense: with cacheComponents, usePathname
 * suspends below dynamic routes, and the fallback keeps the shell prerendered.
 */
export function PrimaryNav({
  label,
  className,
  ...props
}: ComponentProps<typeof NavLinks> & { label: string; className?: string }) {
  return (
    <nav aria-label={label} className={className}>
      <Suspense fallback={<NavLinksFallback role={props.role} variant={props.variant} />}>
        <NavLinks {...props} />
      </Suspense>
    </nav>
  );
}
