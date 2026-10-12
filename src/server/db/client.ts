import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Import restricted to src/server/data/** by eslint.config.mjs: the access
// control of fonctionnalites.md §5.4 applies there, at a single point (SEC-01).

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// One pool per process. In development, hot reload re-evaluates this module:
// keep the pool on globalThis instead of opening a new one on each reload.
const globalForDb = globalThis as unknown as { dbPool?: Pool };

function createPool(connectionString: string): Pool {
  // Short idle timeout (Vercel guidance): idle connections close quickly.
  const created = new Pool({ connectionString, idleTimeoutMillis: 5_000 });
  // On Vercel (Fluid compute), keeps the instance alive just long enough to
  // close idle connections before it is suspended. Does nothing elsewhere.
  attachDatabasePool(created);
  return created;
}

const pool = globalForDb.dbPool ?? createPool(url);
if (process.env.NODE_ENV !== "production") globalForDb.dbPool = pool;

/** TypeScript names in camelCase, SQL names in snake_case (same option in drizzle.config.ts). */
export const db = drizzle({ client: pool, schema, casing: "snake_case" });

export type Db = typeof db;
