// One file per domain, re-exported here: auth.ts (E1), classes.ts (E2), assignments.ts (E3), submissions.ts and notices.ts (E4)…
// After a change: npm run db:generate -- --name=<verb_object>, then review the SQL.
export * from "./auth";
export * from "./classes";
export * from "./assignments";
export * from "./submissions";
export * from "./notices";
