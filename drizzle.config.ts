import { defineConfig } from "drizzle-kit";

// Run inside the container (docker compose exec web npm run db:…), where
// compose.yaml loads DATABASE_URL from .env.local.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
});
