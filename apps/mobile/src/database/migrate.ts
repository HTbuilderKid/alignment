import type { SQLiteDatabase } from "expo-sqlite";

const DATABASE_VERSION = 2;

type UserVersionRow = {
  user_version: number;
};

type TableColumn = {
  name: string;
};

export async function migrateDatabase(
  db: SQLiteDatabase
): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const versionResult =
    await db.getFirstAsync<UserVersionRow>(
      "PRAGMA user_version;"
    );

  let currentVersion =
    versionResult?.user_version ?? 0;

  /*
   * VERSION 1
   *
   * Original user direction table.
   *
   * Existing Step 2 databases already have this
   * table, so CREATE TABLE IF NOT EXISTS is safe.
   */
  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_direction (
        id INTEGER PRIMARY KEY,
        statement TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await db.execAsync(
      "PRAGMA user_version = 1;"
    );

    currentVersion = 1;
  }

  /*
   * VERSION 2
   *
   * Adds:
   * - model confirmation
   * - structured direction items
   */
  if (currentVersion < 2) {
    const columns =
      await db.getAllAsync<TableColumn>(
        "PRAGMA table_info(user_direction);"
      );

    const hasModelConfirmedAt =
      columns.some(
        (column) =>
          column.name === "model_confirmed_at"
      );

    if (!hasModelConfirmedAt) {
      await db.execAsync(`
        ALTER TABLE user_direction
        ADD COLUMN model_confirmed_at TEXT;
      `);
    }

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS direction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_direction_id INTEGER NOT NULL,

        kind TEXT NOT NULL
          CHECK (
            kind IN ('toward', 'reduce')
          ),

        title TEXT NOT NULL,

        description TEXT,

        status TEXT NOT NULL DEFAULT 'active'
          CHECK (
            status IN (
              'active',
              'paused',
              'completed',
              'removed'
            )
          ),

        sort_order INTEGER NOT NULL DEFAULT 0,

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        FOREIGN KEY (user_direction_id)
          REFERENCES user_direction(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS
        idx_direction_items_lookup
      ON direction_items (
        user_direction_id,
        kind,
        status,
        sort_order
      );
    `);

    await db.execAsync(
      `PRAGMA user_version = ${DATABASE_VERSION};`
    );
  }
}