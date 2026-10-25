import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
/** Real SQLite, with the async surface used by Expo repositories. No SQL mocks. */
export function openTestDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  const db = {
    async execAsync(sql: string) {
      sqlite.exec(sql);
    },
    async runAsync(sql: string, ...args: any[]) {
      const result = sqlite.prepare(sql).run(...args);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    async getFirstAsync(sql: string, ...args: any[]) {
      return sqlite.prepare(sql).get(...args) ?? null;
    },
    async getAllAsync(sql: string, ...args: any[]) {
      return sqlite.prepare(sql).all(...args);
    },
    async closeAsync() {
      sqlite.close();
    },
  } as unknown as SQLiteDatabase;
  return db;
}
