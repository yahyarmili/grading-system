import "server-only";
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
const pool = globalForDb.dbPool ?? new Pool({ connectionString: url });
if (process.env.NODE_ENV !== "production") globalForDb.dbPool = pool;

/** TypeScript names in camelCase, SQL names in snake_case (same option in drizzle.config.ts). */
export const db = drizzle({ client: pool, schema, casing: "snake_case" });

export type Db = typeof db;
