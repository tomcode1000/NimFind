import type { Chain } from "./lib/chain";

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  /** Nimiq address that receives Designer Pass payments. */
  TREASURY_ADDRESS: string;
  PASS_PRICE_NIM: string;
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
