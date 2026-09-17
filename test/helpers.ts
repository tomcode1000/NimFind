import { Hash, KeyPair } from "@nimiq/core";
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import type { Chain, ChainTransaction } from "../src/lib/chain";
import { createLibsqlDatabase, type Database, type Statement } from "../src/lib/db";
import { migrate } from "../src/lib/migrate";
import { encodeSignedMessage, textToHex } from "../src/lib/nimiq";

/**
 * The production database adapter over an in-memory Turso (libSQL) database, with migrations
 * applied. Statements wait for the migrations, so harness creation can stay synchronous.
 */
export function createTestDatabase(): Database {
  const client = createClient({ url: ":memory:" });
  const directory = new URL("../migrations/", import.meta.url);
  const ready = migrate(
    client,
    readdirSync(directory)
      .filter((f) => f.endsWith(".sql"))
      .map((name) => ({ name, sql: readFileSync(new URL(name, directory), "utf8") })),
  );
  const db = createLibsqlDatabase(client);
  const wrap = (statement: Statement): Statement => ({
    bind: (...values) => wrap(statement.bind(...values)),
    first: async <T,>() => (await ready, statement.first<T>()),
    all: async <T,>() => (await ready, statement.all<T>()),
    run: async () => (await ready, statement.run()),
    toInStatement: () => statement.toInStatement(),
  });
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: async (statements) => (await ready, db.batch(statements)),
  };
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
    DB: createTestDatabase(),
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
