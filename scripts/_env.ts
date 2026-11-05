/** Loads .env.local / .env for command-line scripts (Next.js does this itself for the web app). */
import fs from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* ignore malformed file; the script will complain about missing variables */
    }
  }
}
