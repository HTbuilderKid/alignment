import { initializeDatabase, withDatabaseTransaction } from './coordinator';
import { migrationV4 } from './migrationV4';
import type { SQLiteDatabase } from "expo-sqlite";

const DATABASE_VERSION = 4;

type UserVersionRow = {
  user_version: number;
};

type TableColumn = {
  name: string;
};

async function migrateVersions(
  db: SQLiteDatabase
): Promise<void> {
  const versionResult =
    await db.getFirstAsync<UserVersionRow>(
      "PRAGMA user_version;"
    );

  let currentVersion =
    versionResult?.user_version ?? 0;

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
      "PRAGMA user_version = 2;"
    );

    currentVersion = 2;
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS promises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        direction_item_id INTEGER,

        title TEXT NOT NULL,
        why TEXT,

        target_kind TEXT NOT NULL
          CHECK (
            target_kind IN (
              'duration',
              'count',
              'action'
            )
          ),

        target_description TEXT NOT NULL,
        target_amount REAL,
        target_unit TEXT,

        minimum_kind TEXT NOT NULL
          CHECK (
            minimum_kind IN (
              'duration',
              'count',
              'action'
            )
          ),

        minimum_description TEXT NOT NULL,
        minimum_amount REAL,
        minimum_unit TEXT,

        scheduled_date TEXT NOT NULL,
        scheduled_time TEXT,

        status TEXT NOT NULL DEFAULT 'planned'
          CHECK (
            status IN (
              'planned',
              'active',
              'kept',
              'missed',
              'cancelled'
            )
          ),

        started_at TEXT,
        minimum_reached_at TEXT,
        target_reached_at TEXT,
        missed_at TEXT,
        cancelled_at TEXT,

        failure_reason TEXT
          CHECK (
            failure_reason IS NULL OR
            failure_reason IN (
              'too_ambitious',
              'forgot',
              'plans_changed',
              'avoided',
              'unexpected_event',
              'chose_something_else',
              'other'
            )
          ),

        failure_note TEXT,

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        FOREIGN KEY (direction_item_id)
          REFERENCES direction_items(id)
          ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS
        idx_promises_date_status
      ON promises (
        scheduled_date,
        status
      );

      CREATE INDEX IF NOT EXISTS
        idx_promises_direction
      ON promises (
        direction_item_id
      );

      CREATE TABLE IF NOT EXISTS behavior_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        type TEXT NOT NULL,

        promise_id INTEGER,
        direction_item_id INTEGER,

        metadata_json TEXT NOT NULL DEFAULT '{}',

        occurred_at TEXT NOT NULL,

        FOREIGN KEY (promise_id)
          REFERENCES promises(id)
          ON DELETE SET NULL,

        FOREIGN KEY (direction_item_id)
          REFERENCES direction_items(id)
          ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS
        idx_behavior_events_promise
      ON behavior_events (
        promise_id,
        occurred_at
      );

      CREATE INDEX IF NOT EXISTS
        idx_behavior_events_type_time
      ON behavior_events (
        type,
        occurred_at
      );
    `);

    await db.execAsync(
      "PRAGMA user_version = 3;"
    );
    currentVersion = 3;
  }
  if (currentVersion < 4) {
    await withDatabaseTransaction(db, async tx => {
      await tx.execAsync(migrationV4);
      await tx.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
    });
  }
}

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  // Initialization is completed before SQLiteProvider renders consumers.
  await initializeDatabase(db, async () => {
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  });
  await migrateVersions(db);
}
