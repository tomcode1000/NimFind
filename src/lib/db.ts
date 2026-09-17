import type { Client, InStatement } from "@libsql/client";

/** The small query interface the routes use. Backed by Turso (libSQL) in production and tests. */
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
  toInStatement(): InStatement;
}

export interface Database {
  prepare(sql: string): Statement;
  /** Runs statements in one transaction: all apply or none do. */
  batch(statements: Statement[]): Promise<void>;
}

type Value = string | number | bigint | null | ArrayBuffer | boolean;

export function createLibsqlDatabase(client: Client): Database {
  function toPlain(columns: string[], row: Record<string, unknown>) {
    const plain: Record<string, unknown> = {};
    for (const column of columns) {
      const value = row[column];
      plain[column] = typeof value === "bigint" ? Number(value) : value;
    }
    return plain;
  }

  function prepare(sql: string, args: Value[] = []): Statement {
    const statement: Statement = {
      bind: (...values) => prepare(sql, values.map((v) => (v === undefined ? null : (v as Value)))),
      async first<T>() {
        const result = await client.execute({ sql, args });
        return result.rows.length ? (toPlain(result.columns, result.rows[0] as Record<string, unknown>) as T) : null;
      },
      async all<T>() {
        const result = await client.execute({ sql, args });
        return { results: result.rows.map((row) => toPlain(result.columns, row as Record<string, unknown>) as T) };
      },
      async run() {
        const result = await client.execute({ sql, args });
        return { meta: { changes: result.rowsAffected } };
      },
      toInStatement: () => ({ sql, args }),
    };
    return statement;
  }

  return {
    prepare: (sql) => prepare(sql),
    async batch(statements) {
      await client.batch(
        statements.map((s) => s.toInStatement()),
        "write",
      );
    },
  };
}
