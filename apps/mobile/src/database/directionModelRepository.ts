import type {
  DirectionDraft,
  DirectionItem,
  DirectionKind,
  DirectionModel,
  DirectionStatus,
} from "@alignment/types";

import type { SQLiteDatabase } from "expo-sqlite";

import {
  getUserDirection,
} from "./userDirectionRepository";

type DirectionItemRow = {
  id: number;

  user_direction_id: number;

  kind: DirectionKind;

  title: string;
  description: string | null;

  status: DirectionStatus;

  sort_order: number;

  created_at: string;
  updated_at: string;
};

function mapDirectionItem(
  row: DirectionItemRow
): DirectionItem {
  return {
    id: row.id,

    userDirectionId:
      row.user_direction_id,

    kind: row.kind,

    title: row.title,
    description: row.description,

    status: row.status,

    sortOrder: row.sort_order,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getDirectionItems(
  db: SQLiteDatabase
): Promise<DirectionItem[]> {
  const rows =
    await db.getAllAsync<DirectionItemRow>(
      `
        SELECT
          id,
          user_direction_id,
          kind,
          title,
          description,
          status,
          sort_order,
          created_at,
          updated_at
        FROM direction_items
        WHERE
          user_direction_id = 1
          AND status != 'removed'
        ORDER BY
          kind,
          sort_order,
          id;
      `
    );

  return rows.map(mapDirectionItem);
}

export async function getDirectionModel(
  db: SQLiteDatabase
): Promise<DirectionModel | null> {
  const direction =
    await getUserDirection(db);

  if (!direction) {
    return null;
  }

  const items =
    await getDirectionItems(db);

  return {
    direction,
    items,
  };
}

export async function saveConfirmedDirectionModel(
  db: SQLiteDatabase,
  drafts: DirectionDraft[]
): Promise<void> {
  const cleanedDrafts =
    drafts
      .map((draft) => ({
        ...draft,

        title:
          draft.title.trim(),

        description:
          draft.description?.trim() ||
          null,
      }))
      .filter(
        (draft) =>
          draft.title.length > 0
      );

  if (cleanedDrafts.length === 0) {
    throw new Error(
      "A direction model needs at least one item."
    );
  }

  const now = new Date().toISOString();

  await db.withTransactionAsync(
    async () => {
      /*
       * Preserve old rows for history instead
       * of physically deleting them.
       */
      await db.runAsync(
        `
          UPDATE direction_items
          SET
            status = 'removed',
            updated_at = ?
          WHERE
            user_direction_id = 1
            AND status != 'removed';
        `,
        now
      );

      let towardOrder = 0;
      let reduceOrder = 0;

      for (const draft of cleanedDrafts) {
        const sortOrder =
          draft.kind === "toward"
            ? towardOrder++
            : reduceOrder++;

        await db.runAsync(
          `
            INSERT INTO direction_items (
              user_direction_id,
              kind,
              title,
              description,
              status,
              sort_order,
              created_at,
              updated_at
            )
            VALUES (
              1,
              ?,
              ?,
              ?,
              'active',
              ?,
              ?,
              ?
            );
          `,
          draft.kind,
          draft.title,
          draft.description,
          sortOrder,
          now,
          now
        );
      }

      await db.runAsync(
        `
          UPDATE user_direction
          SET
            model_confirmed_at = ?,
            updated_at = ?
          WHERE id = 1;
        `,
        now,
        now
      );
    }
  );
}

export async function addDirectionItem(
  db: SQLiteDatabase,
  kind: DirectionKind,
  title: string
): Promise<void> {
  const cleanedTitle = title.trim();

  if (!cleanedTitle) {
    return;
  }

  const now = new Date().toISOString();

  const order =
    await db.getFirstAsync<{
      next_order: number;
    }>(
      `
        SELECT
          COALESCE(
            MAX(sort_order),
            -1
          ) + 1 AS next_order
        FROM direction_items
        WHERE
          user_direction_id = 1
          AND kind = ?
          AND status != 'removed';
      `,
      kind
    );

  await db.runAsync(
    `
      INSERT INTO direction_items (
        user_direction_id,
        kind,
        title,
        description,
        status,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (
        1,
        ?,
        ?,
        NULL,
        'active',
        ?,
        ?,
        ?
      );
    `,
    kind,
    cleanedTitle,
    order?.next_order ?? 0,
    now,
    now
  );

  await db.runAsync(
    `
      UPDATE user_direction
      SET updated_at = ?
      WHERE id = 1;
    `,
    now
  );
}

export async function renameDirectionItem(
  db: SQLiteDatabase,
  id: number,
  title: string
): Promise<void> {
  const cleanedTitle = title.trim();

  if (!cleanedTitle) {
    throw new Error(
      "Direction title cannot be empty."
    );
  }

  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE direction_items
      SET
        title = ?,
        updated_at = ?
      WHERE id = ?;
    `,
    cleanedTitle,
    now,
    id
  );
}

export async function setDirectionItemStatus(
  db: SQLiteDatabase,
  id: number,
  status: DirectionStatus
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE direction_items
      SET
        status = ?,
        updated_at = ?
      WHERE id = ?;
    `,
    status,
    now,
    id
  );
}