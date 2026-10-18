import type {
  BehaviorEvent,
  BehaviorEventType,
} from "@alignment/types";

import type {
  SQLiteDatabase,
} from "expo-sqlite";

type BehaviorEventRow = {
  id: number;

  type: BehaviorEventType;

  promise_id: number | null;

  direction_item_id: number | null;

  metadata_json: string;

  occurred_at: string;
};

function parseMetadata(
  value: string
): Record<string, unknown> {
  try {
    const parsed =
      JSON.parse(value);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<
        string,
        unknown
      >;
    }
  } catch {
    // Bad historical metadata should not
    // crash the rest of the application.
  }

  return {};
}

function mapBehaviorEvent(
  row: BehaviorEventRow
): BehaviorEvent {
  return {
    id: row.id,

    type: row.type,

    promiseId:
      row.promise_id,

    directionItemId:
      row.direction_item_id,

    metadata:
      parseMetadata(
        row.metadata_json
      ),

    occurredAt:
      row.occurred_at,
  };
}

export async function recordBehaviorEvent(
  db: SQLiteDatabase,
  input: {
    type: BehaviorEventType;

    promiseId?: number | null;

    directionItemId?:
      number | null;

    metadata?:
      Record<string, unknown>;

    occurredAt?: string;
  }
): Promise<void> {
  await db.runAsync(
    `
      INSERT INTO behavior_events (
        type,
        promise_id,
        direction_item_id,
        metadata_json,
        occurred_at
      )
      VALUES (?, ?, ?, ?, ?);
    `,

    input.type,

    input.promiseId ?? null,

    input.directionItemId ?? null,

    JSON.stringify(
      input.metadata ?? {}
    ),

    input.occurredAt ??
      new Date().toISOString()
  );
}

export async function getBehaviorEventsForPromise(
  db: SQLiteDatabase,
  promiseId: number
): Promise<BehaviorEvent[]> {
  const rows =
    await db.getAllAsync<
      BehaviorEventRow
    >(
      `
        SELECT
          id,
          type,
          promise_id,
          direction_item_id,
          metadata_json,
          occurred_at
        FROM behavior_events
        WHERE promise_id = ?
        ORDER BY
          occurred_at DESC,
          id DESC;
      `,

      promiseId
    );

  return rows.map(
    mapBehaviorEvent
  );
}