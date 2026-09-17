import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createClient } from "@libsql/client";
import { Hono } from "hono";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createApp } from "../src/app";
import { createLibsqlDatabase } from "../src/lib/db";
import { migrate } from "../src/lib/migrate";
import { envFromProcess } from "./env";

/**
 * Local server: the API plus the built Vue app from dist/, with a SQLite file in .data/.
 * Settings come from .dev.vars. Run `npm run build` first so dist/ exists.
 */
const vars: Record<string, string | undefined> = { ...process.env };
try {
  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) vars[match[1]] = match[2];
  }
} catch {
  console.warn("No .dev.vars file found. See README for local setup.");
}

mkdirSync(".data", { recursive: true });
const client = createClient({ url: vars.TURSO_DATABASE_URL ?? "file:.data/local.db", authToken: vars.TURSO_AUTH_TOKEN });
const applied = await migrate(
  client,
  readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(`migrations/${name}`, "utf8") })),
);
if (applied.length) console.log(`Applied migrations: ${applied.join(", ")}`);

const env = envFromProcess(createLibsqlDatabase(client), vars);
const api = createApp();
const server = new Hono();

server.all("/api/*", (c) => api.fetch(c.req.raw, env));
server.use("/*", serveStatic({ root: "./dist" }));
// Single page app: unknown paths get index.html so the Vue router can handle them.
server.get("*", serveStatic({ path: "./dist/index.html" }));

const port = Number(vars.PORT ?? 8787);
// `npm run dev -- --host` makes the server reachable from a phone on the same Wi-Fi.
const hostname = process.argv.includes("--host") ? "0.0.0.0" : (vars.HOST ?? "127.0.0.1");
serve({ fetch: server.fetch, port, hostname }, () => {
  console.log(`NimFind running on http://${hostname}:${port} (${env.NIMIQ_NETWORK === "testnet" ? "testnet" : "mainnet"})`);
});
