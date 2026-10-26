// Runs one allowed script against the production database (spec 0012, AC-7),
// without anyone reading its address: it goes from the environment to the
// child process, never to the screen. Run inside the container, where
// compose.yaml loads PRODUCTION_DATABASE_URL (Neon's direct connection) and
// PRODUCTION_APP_URL from .env.local:
//   docker compose exec -T web npm run prod -- db:migrate
//   docker compose exec -T web npm run prod -- admin:create --email … --first-name … --last-name …
//   docker compose exec -T web npm run prod -- ai:status [--since <date>]
//   docker compose exec -T web npm run prod -- ai:report
// The rules live in prod-guard.ts.

import { spawn } from "node:child_process";
import { planProdRun } from "./prod-guard";

const plan = planProdRun(process.argv.slice(2), process.env);
if (!plan.ok) {
  console.error(plan.error);
  process.exit(1);
}

// The test database is no business of a production script.
const env: NodeJS.ProcessEnv = { ...process.env, ...plan.env };
delete env.DATABASE_URL_TEST;

console.log(`Running ${plan.script} against production.`);
const child = spawn("npm", ["run", plan.script, "--", ...plan.args], { env, stdio: "inherit" });
child.on("error", () => {
  console.error(`Could not start ${plan.script}.`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
