import { rm } from "node:fs/promises";
import resetTestDatabase from "../../tests/setup/global-db";
import { E2E_MAIL_DIR } from "./env";

/** Each run starts from an empty test database (migrations applied) and an empty mailbox. */
export default async function globalSetup() {
  await rm(E2E_MAIL_DIR, { recursive: true, force: true });
  await resetTestDatabase();
}
