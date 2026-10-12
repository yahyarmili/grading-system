import "server-only";
import { db } from "@/server/db/client";

/** For local scripts: closes the pool so the process can exit. */
export async function closeDatabase(): Promise<void> {
  await db.$client.end();
}
