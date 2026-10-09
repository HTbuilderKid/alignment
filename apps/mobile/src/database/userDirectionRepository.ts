import type { UserDirection } from "@alignment/types";
import type { SQLiteDatabase } from "expo-sqlite";

type UserDirectionRow = {
  id: number;

  statement: string;

  model_confirmed_at: string | null;

  created_at: string;
  updated_at: string;
};

export async function getUserDirection(
  db: SQLiteDatabase
): Promise<UserDirection | null> {
  const row =
    await db.getFirstAsync<UserDirectionRow>(
      `
        SELECT
          id,
          statement,
          model_confirmed_at,
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

    modelConfirmedAt:
      row.model_confirmed_at,

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
        model_confirmed_at,
        created_at,
        updated_at
      )
      VALUES (
        1,
        ?,
        NULL,
        ?,
        ?
      )

      ON CONFLICT(id)
      DO UPDATE SET
        statement = excluded.statement,
        model_confirmed_at = NULL,
        updated_at = excluded.updated_at;
    `,
    statement.trim(),
    now,
    now
  );
}