import "server-only";
import { eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { AccessDeniedError } from "@/server/access/errors";
import type { Grant } from "@/server/access/policy";

/** How a resource designates its owner: a column holding the user id, or a condition on that id. */
type Owner = AnyPgColumn | ((userId: string) => SQL);

/**
 * The ownership filter of a grant, to put in the query's WHERE: another
 * person's resource is then absent, the same answer as a missing one (AUTH-04 R3).
 * Undefined for an "any" grant. A role without owner here is refused (deny by default).
 */
export function ownedBy(grant: Grant, owners: { student?: Owner; teacher?: Owner }): SQL | undefined {
  if (grant.scope === "any") return undefined;
  const owner = grant.role === "student" || grant.role === "teacher" ? owners[grant.role] : undefined;
  if (!owner) throw new AccessDeniedError();
  return typeof owner === "function" ? owner(grant.userId) : eq(owner, grant.userId);
}
