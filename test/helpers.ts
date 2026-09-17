import { Hash, KeyPair } from "@nimiq/core";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import type { Chain, ChainTransaction } from "../src/lib/chain";
import { encodeSignedMessage, textToHex } from "../src/lib/nimiq";

/** Minimal D1 implementation over node:sqlite, covering what the app uses. */
export function createTestD1(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  }

  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        params = values.map((v) => (v === undefined ? null : v));
        return statement;
      },
      async first(column?: string) {
        const row = sqlite.prepare(sql).get(...(params as never[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        return column ? row[column] : { ...row };
      },
      async all() {
        const rows = sqlite.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
        return { results: rows.map((r) => ({ ...r })), success: true, meta: {} };
      },
      async run() {
        const result = sqlite.prepare(sql).run(...(params as never[]));
        return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
    return statement;
  };

  return {
    prepare,
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
}

export class FakeChain implements Chain {
  readonly transactions: ChainTransaction[] = [];
  readonly balances = new Map<string, number>();
  failing = false;

  async getBalance(address: string): Promise<number> {
    if (this.failing) throw new Error("RPC down");
    return this.balances.get(address) ?? 0;
  }

  async getTransactionsByAddress(address: string): Promise<ChainTransaction[]> {
    if (this.failing) throw new Error("RPC down");
    return this.transactions.filter((tx) => tx.from === address || tx.to === address);
  }

  pay(input: { from: string; to: string; valueLuna: number; data: string; confirmations?: number }) {
    const tx: ChainTransaction = {
      hash: crypto.randomUUID().replace(/-/g, ""),
      from: input.from,
      to: input.to,
      value: input.valueLuna,
      senderData: "",
      recipientData: textToHex(input.data),
      confirmations: input.confirmations ?? 3,
      timestamp: Date.now(),
      executionResult: true,
    };
    this.transactions.unshift(tx);
    return tx;
  }
}

export function createHarness(envOverrides: Partial<Env> = {}) {
  const chain = new FakeChain();
  const clock = { now: Date.UTC(2026, 8, 16, 12, 0, 0) };
  const env: Env = {
    DB: createTestD1(),
    SESSION_SECRET: "test-secret-that-is-long-enough-for-hmac-use",
    TREASURY_ADDRESS: "",
    PASS_PRICE_NIM: "1000",
    RPC_URLS: "",
    ALLOWED_ORIGINS: "http://localhost:5173",
    ...envOverrides,
  };
  const app = createApp({ chain: () => chain, now: () => clock.now });

  async function call(method: string, path: string, options: { body?: unknown; token?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const response = await app.request(
      path,
      { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) },
      env,
    );
    const json = (await response.json()) as any;
    return { status: response.status, json };
  }

  /** Runs the full sign in flow the way the Mini App will, with a real Nimiq key pair. */
  async function signIn(keyPair = KeyPair.generate()) {
    const address = keyPair.toAddress().toUserFriendlyAddress();
    const challenge = await call("POST", "/api/auth/challenge", { body: { address } });
    const signature = keyPair.sign(Hash.computeSha256(encodeSignedMessage(challenge.json.message)));
    const verified = await call("POST", "/api/auth/verify", {
      body: { nonce: challenge.json.nonce, publicKey: keyPair.publicKey.toHex(), signature: signature.toHex() },
    });
    return { keyPair, address, token: verified.json.token as string };
  }

  return { app, env, chain, clock, call, signIn };
}

export function newAddress(): string {
  return KeyPair.generate().toAddress().toUserFriendlyAddress();
}
