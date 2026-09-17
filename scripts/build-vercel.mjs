// Packages the built app for Vercel using the Build Output API:
// the Vue app becomes static files, and the API becomes one Edge Function at /api.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const out = ".vercel/output";
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/functions/api.func`, { recursive: true });

cpSync("dist", `${out}/static`, { recursive: true });

await build({
  entryPoints: ["server/vercel.ts"],
  outfile: `${out}/functions/api.func/index.js`,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  conditions: ["edge-light", "worker", "browser"],
  minify: true,
  // OneDrive marks synced files as reparse points; resolve them as plain paths.
  preserveSymlinks: true,
});

writeFileSync(
  `${out}/functions/api.func/.vc-config.json`,
  JSON.stringify(
    {
      runtime: "edge",
      entrypoint: "index.js",
      envVarsInUse: [
        "TURSO_DATABASE_URL",
        "TURSO_AUTH_TOKEN",
        "SESSION_SECRET",
        "TREASURY_ADDRESS",
        "PASS_PRICE_NIM",
        "NIMIQ_NETWORK",
        "RPC_URLS",
        "ALLOWED_ORIGINS",
      ],
    },
    null,
    2,
  ),
);

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/api/(.*)$", dest: "/api?__path=$1" },
        { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { handle: "filesystem" },
        // Single page app: every other path loads index.html and the Vue router takes over.
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log("Vercel output written to .vercel/output");
