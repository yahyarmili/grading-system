import { afterAll, beforeEach } from "vitest";
import { db } from "@/server/db/client";
import { truncateAll } from "../helpers/db";

// Each integration test starts from empty tables.
beforeEach(truncateAll);

afterAll(async () => {
  await db.$client.end();
  delete (globalThis as { dbPool?: unknown }).dbPool;
});
