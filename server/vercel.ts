import { createClient } from "@libsql/client/web";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { createLibsqlDatabase } from "../src/lib/db";
import { envFromProcess } from "./env";

// Vercel Edge Function serving everything under /api. Bundled by scripts/build-vercel.mjs.
const app = createApp();
let env: Env | undefined;

function getEnv(): Env {
  env ??= envFromProcess(
    createLibsqlDatabase(createClient({ url: process.env.TURSO_DATABASE_URL ?? "", authToken: process.env.TURSO_AUTH_TOKEN })),
    process.env,
  );
  return env;
}

export default async function handler(request: Request): Promise<Response> {
  // The route config rewrites /api/<path> to this function with ?__path=<path>; restore the original path.
  const url = new URL(request.url);
  const path = url.searchParams.get("__path");
  if (path !== null) {
    url.pathname = `/api/${path}`;
    url.searchParams.delete("__path");
    // Read the body first: rebuilding a request around a streamed body is not supported in every runtime.
    // API bodies are small (at most 16 KB), so buffering is cheap.
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    request = new Request(url, { method: request.method, headers: request.headers, body });
  }
  return app.fetch(request, getEnv());
}
