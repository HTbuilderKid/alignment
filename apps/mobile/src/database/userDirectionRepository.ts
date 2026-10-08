import type { SQLiteDatabase } from "expo-sqlite";
import type { UserDirection } from "../types/userDirection";

type UserDirectionRow = {
  id: number;
  statement: string;
  created_at: string;
  updated_at: string;
};

export async function getUserDirection(
  db: SQLiteDatabase
): Promise<UserDirection | null> {
  const row = await db.getFirstAsync<UserDirectionRow>(
    `
      SELECT
        id,
        statement,
        created_at,
        updated_at
      FROM user_direction
      WHERE id = 1;
    `
  );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    statement: row.statement,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveUserDirection(
  db: SQLiteDatabase,
  statement: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO user_direction (
        id,
        statement,
        created_at,
        updated_at
      )
      VALUES (1, ?, ?, ?)

      ON CONFLICT(id)
      DO UPDATE SET
        statement = excluded.statement,
        updated_at = excluded.updated_at;
    `,
    statement.trim(),
    now,
    now
  );
}