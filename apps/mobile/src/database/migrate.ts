import type { SQLiteDatabase } from "expo-sqlite";

export async function migrateDatabase(
  db: SQLiteDatabase
): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS user_direction (
      id INTEGER PRIMARY KEY,
      statement TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}