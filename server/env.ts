import type { Env } from "../src/env";
import type { Database } from "../src/lib/db";

/** Builds the app environment from process variables. Unset network means mainnet. */
export function envFromProcess(db: Database, vars: Record<string, string | undefined>): Env {
  return {
    DB: db,
    SESSION_SECRET: vars.SESSION_SECRET ?? "",
    TREASURY_ADDRESS: vars.TREASURY_ADDRESS ?? "",
    PASS_PRICE_NIM: vars.PASS_PRICE_NIM ?? "1000",
    NIMIQ_NETWORK: vars.NIMIQ_NETWORK,
    RPC_URLS: vars.RPC_URLS,
    ALLOWED_ORIGINS: vars.ALLOWED_ORIGINS,
  };
}
