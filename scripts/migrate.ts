// Applies database migrations to Turso. Runs during the Vercel build, and locally with `npm run db:migrate`.
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import { migrate } from "../src/lib/migrate";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL is not set. Add the Turso integration to the Vercel project first.");
  process.exit(1);
}

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
const applied = await migrate(
  client,
  readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(`migrations/${name}`, "utf8") })),
);
console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database is up to date.");
