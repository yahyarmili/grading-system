import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { assertTestDatabaseUrl } from "./test-db-url";

/**
 * Once per integration run: empties the test database, then applies the
 * committed migrations, so it matches drizzle/ exactly.
 */
export default async function setup() {
  const url = assertTestDatabaseUrl(process.env.DATABASE_URL_TEST, process.env.DATABASE_URL);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
    );
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}
