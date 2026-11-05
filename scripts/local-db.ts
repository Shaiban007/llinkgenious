/**
 * Starts a real PostgreSQL database on your own computer (no Docker, no installation).
 * Run with:  npm run db:local      Leave this terminal open while you use the app.
 * Data is kept in the ".pgdata" folder, so it survives restarts. Stop with Ctrl+C.
 */
import fs from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const DIR = ".pgdata";
const PORT = 5433;
const DB = "linkgenius";

async function main() {
  const pg = new EmbeddedPostgres({ databaseDir: DIR, user: "postgres", password: "postgres", port: PORT, persistent: true });
  const fresh = !fs.existsSync(`${DIR}/PG_VERSION`);
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(DB);
  else {
    try {
      await pg.createDatabase(DB);
    } catch {
      /* already exists */
    }
  }
  console.log(`\n✔ Database is running on port ${PORT}.`);
  console.log(`  DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${PORT}/${DB}"`);
  console.log("  Next: open a second terminal and run  npm run db:migrate  (first time only), then  npm run dev");
  console.log("  Leave this window open. Press Ctrl+C to stop.\n");
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error("Could not start the database:", e instanceof Error ? e.message : e);
  process.exit(1);
});
