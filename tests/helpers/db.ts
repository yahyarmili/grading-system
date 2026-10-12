import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

/** Empties every table of the public schema; migration history (drizzle schema) is kept. */
export async function truncateAll() {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
}
