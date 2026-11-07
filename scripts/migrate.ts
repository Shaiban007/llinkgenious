/**
 * Applies all database migrations from the /drizzle folder.
 * Run with:  npm run db:migrate
 */
import "./_env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Create .env.local from .env.example first.");
    process.exit(1);
  }
  const client = postgres(url, { max: 1, prepare: false }); // prepare:false keeps this working through hosted poolers
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("✔ Database is up to date.");
  } catch (e) {
    console.error("Migration failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
