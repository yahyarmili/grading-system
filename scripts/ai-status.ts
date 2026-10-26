// Internal command (spec 0012, AC-11): what the AI did on the database
// DATABASE_URL names (production through `npm run prod`): the runs and the
// request lines of the window, then this month's cost against the cap and
// today's requests. Identifiers, counts and costs only; calls no AI, writes
// nothing. Run inside the container:
//   docker compose exec -T web npm run ai:status
//   docker compose exec -T web npm run ai:status -- --since 2026-10-26
//   docker compose exec -T web npm run prod -- ai:status --since 2026-10-26T09:00:00Z
// Runs with --conditions=react-server so "server-only" modules load outside Next.

import { parseArgs } from "node:util";
import { AI_DAILY_REQUEST_LIMIT, AI_MONTHLY_COST_CAP_USD } from "@/config/provisional";
import { countAiRequestsToday } from "@/server/data/auth/security-events";
import { readAiStatus } from "@/server/data/evaluation/measures";
import { closeDatabase } from "@/server/data/lifecycle";
import { readMonthCostUsd } from "@/server/evaluation/month-cost";
import { formatStatus, parseSince } from "@/server/evaluation/status";

const USAGE = "Usage: npm run ai:status -- [--since <date or ISO instant, not in the future>]";

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { since: { type: "string" } } });
  const since = values.since === undefined ? undefined : parseSince(values.since, new Date());
  if (since === null) {
    console.error(USAGE);
    return 2;
  }
  const status = await readAiStatus({ since });
  const period = {
    now: new Date(),
    monthCostUsd: await readMonthCostUsd(),
    capUsd: AI_MONTHLY_COST_CAP_USD,
    requestsToday: await countAiRequestsToday(),
    dailyLimit: AI_DAILY_REQUEST_LIMIT,
  };
  console.log(formatStatus(status, period));
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
