import type { Role } from "@/lib/roles";
import type { Actor } from "./actor";
import { AccessDeniedError } from "./errors";
import { ACCESS_MATRIX, type Action, type Column, type Resource } from "./matrix";

/**
 * What the actor may reach once authorized:
 * - "any": every resource of this kind (administrator, or a row with no owner, like the rubric);
 * - "own": only their own; the query must filter on it (ownedBy, src/server/data/access.ts),
 *   so that another person's resource is absent, exactly like one that does not exist.
 */
export type Grant = { scope: "any" | "own"; userId: string; role: Role };

const OWN: Record<"student" | "teacher", Column> = { student: "concernedStudent", teacher: "ownerTeacher" };
const OTHER: Record<"student" | "teacher", Column> = { student: "otherStudent", teacher: "otherTeacher" };

/**
 * The single access check (AUTH-04 R1, SEC-01). Every data function that
 * takes an Actor calls it first, with a literal resource and action (checked
 * by tests/access-inventory.test.ts). Deny by default: AccessDeniedError when
 * the actor's role has the action on none of these resources.
 */
export function authorize(actor: Actor, resource: Resource, action: Action): Grant {
  const row = ACCESS_MATRIX[resource];
  // Every visitor cell of §5.4 is "—": public flows (sign-up, sign-in, links)
  // sit outside the matrix, listed in inventory.ts.
  if (actor.kind === "visitor") throw new AccessDeniedError();

  const { userId, role } = actor;
  if (role === "admin") {
    if (!(row.admin as readonly Action[]).includes(action)) throw new AccessDeniedError();
    return { scope: "any", userId, role };
  }
  if (!(row[OWN[role]] as readonly Action[]).includes(action)) throw new AccessDeniedError();
  const anyone = (row[OTHER[role]] as readonly Action[]).includes(action);
  return { scope: anyone ? "any" : "own", userId, role };
}
