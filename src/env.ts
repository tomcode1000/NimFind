import type { Chain } from "./lib/chain";
import type { Database } from "./lib/db";

export interface Env {
  DB: Database;
  SESSION_SECRET: string;
  /** Nimiq address that receives wallpaper payments. Without it, designer wallpapers are free. */
  TREASURY_ADDRESS: string;
  /** Price of one designer wallpaper in NIM. Defaults to 100. */
  WALLPAPER_PRICE_NIM?: string;
  /** "mainnet" or "testnet". Selects default RPC nodes and is shown in the app. */
  NIMIQ_NETWORK?: string;
  /** Optional comma separated JSON-RPC endpoints, tried in order. Overrides the network defaults. */
  RPC_URLS?: string;
  /** Comma separated origins allowed to call the API from another host, e.g. the Vite dev server. */
  ALLOWED_ORIGINS?: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    address: string;
    chain: Chain;
    now: number;
  };
}
