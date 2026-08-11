import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

export const DEFAULT_DATABASE_PATH = resolve("data", "lyrics-assist.db");

export interface PersistenceDatabaseConnection {
  readonly client: DatabaseSync;
  readonly db: ReturnType<typeof drizzle>;
  close(): void;
}

/** Open node:sqlite behind the Infrastructure boundary without auto-migrating. */
export function openPersistenceDatabase(
  databasePath = DEFAULT_DATABASE_PATH,
): PersistenceDatabaseConnection {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const client = new DatabaseSync(databasePath);
  client.exec("PRAGMA foreign_keys = ON");

  const foreignKeys = client.prepare("PRAGMA foreign_keys").get();

  if (foreignKeys?.foreign_keys !== 1) {
    client.close();
    throw new Error("SQLite foreign key enforcement could not be enabled");
  }

  const db = drizzle({ client });

  return {
    client,
    db,
    close: () => client.close(),
  };
}

/** Apply reviewed SQL migrations only when explicitly invoked by tooling/tests. */
export function migratePersistenceDatabase(
  db: ReturnType<typeof drizzle>,
  migrationsFolder: string,
): void {
  const result = migrate(db, { migrationsFolder });

  if (result !== undefined) {
    throw new Error(`Migration failed: ${JSON.stringify(result)}`);
  }
}

export type PersistenceDatabase = ReturnType<typeof drizzle>;
