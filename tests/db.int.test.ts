import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { truncateAll } from "./helpers/db";

describe("test database", () => {
  it("answers a query", async () => {
    const { rows } = await db.execute<{ one: number }>(sql`SELECT 1 AS one`);
    expect(rows).toEqual([{ one: 1 }]);
  });

  it("is the test database, with the committed migrations applied", async () => {
    const { rows } = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`,
    );
    expect(rows[0].count).toBeGreaterThan(0);
  });

  it("is emptied by truncateAll", async () => {
    // Throwaway table, dropped by the next global reset.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS reset_probe (id int)`);
    await db.execute(sql`INSERT INTO reset_probe VALUES (1)`);
    await truncateAll();
    const { rows } = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM reset_probe`,
    );
    expect(rows[0].count).toBe(0);
  });
});
