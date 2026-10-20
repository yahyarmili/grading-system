// Internal command (E6.4, EXP-01): the evaluation report, by assignment.
// Delay from submission to "To review", AI usage per copy and its estimated
// cost, attempts and failure rate; no name, email, text or proposal, an
// assignment is named by its identifier only. Reads the database, calls
// nothing. Run inside the container:
//   docker compose exec web npm run ai:report
//   docker compose exec web npm run ai:report -- --assignment <id>
//   docker compose exec web npm run ai:report -- --since 2026-10-20T10:00:00Z
// Runs with --conditions=react-server so "server-only" modules load outside Next.

import { parseArgs } from "node:util";
import { readEvaluationMeasures } from "@/server/data/evaluation/measures";
import { closeDatabase } from "@/server/data/lifecycle";
import { buildReport, formatReport } from "@/server/evaluation/report";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = "Usage: npm run ai:report -- [--assignment <id>] [--since <ISO date>]";

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { assignment: { type: "string" }, since: { type: "string" } } });
  if (values.assignment !== undefined && !UUID.test(values.assignment)) {
    console.error(USAGE);
    return 2;
  }
  const since = values.since === undefined ? undefined : new Date(values.since);
  if (since && Number.isNaN(since.getTime())) {
    console.error(USAGE);
    return 2;
  }
  const { runs, copies } = await readEvaluationMeasures({ assignmentId: values.assignment, since });
  const scope = [
    values.assignment ? `assignment ${values.assignment}` : "every assignment",
    since ? `runs since ${since.toISOString()}` : "every run",
  ].join(", ");
  console.log(formatReport(buildReport(runs, copies), `Date: ${new Date().toISOString()}. Scope: ${scope}.`));
  return 0;
}

main()
  .then(async (code) => {
    await closeDatabase();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    // Its class only, never its message: a database message may quote values.
    console.error(`Failed: ${error instanceof Error ? error.name : "unknown"}`);
    await closeDatabase().catch(() => {});
    process.exit(1);
  });
