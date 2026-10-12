import type { Role } from "@/lib/roles";

/**
 * Who is asking. Every function of src/server/data/ takes it as first argument
 * and applies the access matrix of fonctionnalites.md §5.4 to it.
 * Built from the session from E1 on; tests build it directly.
 */
export type Actor =
  | { kind: "visitor" }
  | { kind: "user"; userId: string; role: Role };
