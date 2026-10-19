import { rm } from "node:fs/promises";
import resetTestDatabase from "../../tests/setup/global-db";
import { E2E_MAIL_DIR, E2E_WORKFLOW_DIR } from "./env";

/** Each run starts from an empty test database (migrations applied), an empty mailbox and no workflow run. */
export default async function globalSetup() {
  await rm(E2E_MAIL_DIR, { recursive: true, force: true });
  await rm(E2E_WORKFLOW_DIR, { recursive: true, force: true });
  await resetTestDatabase();
}
