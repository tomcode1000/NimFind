import type { Client } from "@libsql/client";

export interface Migration {
  name: string;
  sql: string;
}

/** Applies migrations that have not run yet, in name order, recording each one. Returns the names applied. */
export async function migrate(client: Client, migrations: Migration[]): Promise<string[]> {
  await client.execute("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const done = new Set((await client.execute("SELECT name FROM _migrations")).rows.map((row) => String(row.name)));
  const applied: string[] = [];
  for (const migration of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    if (done.has(migration.name)) continue;
    await client.executeMultiple(migration.sql);
    await client.execute({ sql: "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", args: [migration.name, Date.now()] });
    applied.push(migration.name);
  }
  return applied;
}
