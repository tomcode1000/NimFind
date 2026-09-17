import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv, Env } from "./env";
import { createRpcChain, type Chain } from "./lib/chain";
import { HttpError } from "./lib/http";
import { normalizeAddress } from "./lib/nimiq";
import { auth } from "./routes/auth";
import { pass } from "./routes/pass";
import { publicRoutes } from "./routes/public";
import { reports } from "./routes/reports";
import { tags } from "./routes/tags";
import { publicWallpapers, wallpaperLinks } from "./routes/wallpapers";

const DEFAULT_RPC_URLS = {
  mainnet: ["https://rpc.nimiqwatch.com", "https://api.nimiqscan.com"],
  testnet: ["https://rpc.testnet.nimiqwatch.com", "https://api-testnet.nimiqscan.com"],
};

export interface AppOptions {
  chain?: (env: Env) => Chain;
  now?: () => number;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>();

  app.use("/api/*", (c, next) => {
    const allowed = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
    return cors({
      origin: (origin) => (allowed.includes(origin) ? origin : null),
      allowHeaders: ["authorization", "content-type", "x-finder-token"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    })(c, next);
  });

  app.use("/api/*", async (c, next) => {
    if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length < 32) {
      throw new HttpError(503, "misconfigured", "Server is missing its session secret.");
    }
    c.set("now", options.now ? options.now() : Date.now());
    c.set("chain", options.chain ? options.chain(c.env) : createRpcChain(rpcUrls(c.env)));
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/config", (c) => {
    const price = Number(c.env.PASS_PRICE_NIM);
    return c.json({
      network: nimiqNetwork(c.env),
      passPriceNim: Number.isFinite(price) && price > 0 ? price : 1000,
      passAvailable: Boolean(normalizeAddress(c.env.TREASURY_ADDRESS)),
    });
  });
  app.route("/api/auth", auth);
  app.route("/api/tags", tags);
  app.route("/api/reports", reports);
  app.route("/api/pass", pass);
  app.route("/api/public/wallpapers", publicWallpapers);
  app.route("/api/public", publicRoutes);
  app.route("/api/wallpaper-links", wallpaperLinks);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found." } }, 404));

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error(error);
    return c.json({ error: { code: "internal", message: "Something went wrong." } }, 500);
  });

  return app;
}

export function nimiqNetwork(env: Env): "mainnet" | "testnet" {
  return env.NIMIQ_NETWORK === "testnet" ? "testnet" : "mainnet";
}

export function rpcUrls(env: Env): string[] {
  const configured = (env.RPC_URLS ?? "").split(",").map((u) => u.trim()).filter(Boolean);
  return configured.length ? configured : DEFAULT_RPC_URLS[nimiqNetwork(env)];
}
