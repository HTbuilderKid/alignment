import { coordinated, databaseNow } from './coordinator';
import type {
  AlignmentPromise,
  CreatePromiseInput,
  PromiseFailureReason,
  PromiseMeasure,
  PromiseMeasureKind,
  PromiseStatus,
} from "@alignment/types";

import type {
  SQLiteDatabase,
} from "expo-sqlite";

import {
  recordBehaviorEvent,
} from "./behaviorEventRepository";

type PromiseRow = {
  id: number;

  direction_item_id:
    number | null;

  title: string;

  why: string | null;

  target_kind:
    PromiseMeasureKind;

  target_description: string;

  target_amount:
    number | null;

  target_unit:
    string | null;

  minimum_kind:
    PromiseMeasureKind;

  minimum_description: string;

  minimum_amount:
    number | null;

  minimum_unit:
    string | null;

  scheduled_date: string;

  scheduled_time:
    string | null;

  status:
    PromiseStatus;

  started_at:
    string | null;

  minimum_reached_at:
    string | null;

  target_reached_at:
    string | null;

  missed_at:
    string | null;

  cancelled_at:
    string | null;

  failure_reason:
    PromiseFailureReason | null;

  failure_note:
    string | null;

  created_at: string;
  updated_at: string;
};

function mapMeasure(
  kind: PromiseMeasureKind,
  description: string,
  amount: number | null,
  unit: string | null
): PromiseMeasure {
  return {
    kind,
    description,
    amount,
    unit,
  };
}

function mapPromise(
  row: PromiseRow
): AlignmentPromise {
  return {
    id: row.id,

    directionItemId:
      row.direction_item_id,

    title: row.title,

    why: row.why,

    target: mapMeasure(
      row.target_kind,
      row.target_description,
      row.target_amount,
      row.target_unit
    ),

    minimum: mapMeasure(
      row.minimum_kind,
      row.minimum_description,
      row.minimum_amount,
      row.minimum_unit
    ),

    scheduledDate:
      row.scheduled_date,

    scheduledTime:
      row.scheduled_time,

    status:
      row.status,

    startedAt:
      row.started_at,

    minimumReachedAt:
      row.minimum_reached_at,

    targetReachedAt:
      row.target_reached_at,

    missedAt:
      row.missed_at,

    cancelledAt:
      row.cancelled_at,

    failureReason:
      row.failure_reason,

    failureNote:
      row.failure_note,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function cleanMeasure(
  measure: PromiseMeasure
): PromiseMeasure {
  const description =
    measure.description.trim();

  if (!description) {
    throw new Error(
      "Promise measure description cannot be empty."
    );
  }

  if (
    (
      measure.kind === "duration" ||
      measure.kind === "count"
    ) &&
    (
      measure.amount === null ||
      measure.amount <= 0
    )
  ) {
    throw new Error(
      "Measured promises need a positive amount."
    );
  }

  return {
    kind:
      measure.kind,

    description,

    amount:
      measure.kind === "action"
        ? null
        : measure.amount,

    unit:
      measure.kind === "duration"
        ? "minutes"
        : measure.kind === "count"
          ? measure.unit?.trim() ||
            "items"
          : null,
  };
}

async function createPromiseImpl(
  db: SQLiteDatabase,
  input: CreatePromiseInput
): Promise<number> {
  const title =
    input.title.trim();

  if (!title) {
    throw new Error(
      "Promise title cannot be empty."
    );
  }

  const target =
    cleanMeasure(
      input.target
    );

  const minimum =
    cleanMeasure(
      input.minimum
    );

  if (
    target.kind === minimum.kind &&
    target.kind !== "action" &&
    target.unit === minimum.unit &&
    target.amount !== null &&
    minimum.amount !== null &&
    minimum.amount > target.amount
  ) {
    throw new Error(
      "The minimum cannot be larger than the target."
    );
  }

  const now =
    new Date(databaseNow(db)).toISOString();

  let promiseId = 0;

  await db.withTransactionAsync(
    async () => {
      const result =
        await db.runAsync(
          `
            INSERT INTO promises (
              direction_item_id,

              title,
              why,

              target_kind,
              target_description,
              target_amount,
              target_unit,

              minimum_kind,
              minimum_description,
              minimum_amount,
              minimum_unit,

              scheduled_date,
              scheduled_time,

              status,

              created_at,
              updated_at
            )
            VALUES (
              ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?,
              'planned',
              ?, ?
            );
          `,

          input.directionItemId,

          title,

          input.why?.trim() ||
            null,

          target.kind,
          target.description,
          target.amount,
          target.unit,

          minimum.kind,
          minimum.description,
          minimum.amount,
          minimum.unit,

          input.scheduledDate,

          input.scheduledTime
            ?.trim() ||
            null,

          now,
          now
        );

      promiseId =
        Number(
          result.lastInsertRowId
        );

      await recordBehaviorEvent(
        db,
        {
          type:
            "promise_created",

          promiseId,

          directionItemId:
            input.directionItemId,

          metadata: {
            scheduledDate:
              input.scheduledDate,

            minimum,

            target,
          },

          occurredAt:
            now,
        }
      );
    }
  );

  return promiseId;
}

async function getPromiseByIdImpl(
  db: SQLiteDatabase,
  id: number
): Promise<AlignmentPromise | null> {
  const row =
    await db.getFirstAsync<
      PromiseRow
    >(
      `
        SELECT *
        FROM promises
        WHERE id = ?;
      `,

      id
    );

  return row
    ? mapPromise(row)
    : null;
}

async function getPromisesForDateImpl(
  db: SQLiteDatabase,
  scheduledDate: string
): Promise<AlignmentPromise[]> {
  const rows =
    await db.getAllAsync<
      PromiseRow
    >(
      `
        SELECT *
        FROM promises
        WHERE scheduled_date = ?
        ORDER BY
          CASE status
            WHEN 'active' THEN 0
            WHEN 'planned' THEN 1
            WHEN 'kept' THEN 2
            WHEN 'missed' THEN 3
            ELSE 4
          END,

          COALESCE(
            scheduled_time,
            '99:99'
          ),

          id;
      `,

      scheduledDate
    );

  return rows.map(
    mapPromise
  );
}

async function startPromiseImpl(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  const promise =
    await getPromiseById(
      db,
      id
    );

  if (
    !promise ||
    promise.status !== "planned"
  ) {
    return;
  }

  const now =
    new Date(databaseNow(db)).toISOString();

  await db.withTransactionAsync(
    async () => {
      await db.runAsync(
        `
          UPDATE promises
          SET
            status = 'active',

            started_at =
              COALESCE(
                started_at,
                ?
              ),

            updated_at = ?

          WHERE id = ?;
        `,

        now,
        now,
        id
      );

      await recordBehaviorEvent(
        db,
        {
          type:
            "promise_started",

          promiseId:
            id,

          directionItemId:
            promise.directionItemId,

          occurredAt:
            now,
        }
      );
    }
  );
}

async function markMinimumReachedImpl(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  const promise =
    await getPromiseById(
      db,
      id
    );

  if (
    !promise ||
    promise.minimumReachedAt ||
    promise.status === "missed" ||
    promise.status === "cancelled"
  ) {
    return;
  }

  const now =
    new Date(databaseNow(db)).toISOString();

  await db.withTransactionAsync(
    async () => {
      await db.runAsync(
        `
          UPDATE promises
          SET
            status = 'kept',

            minimum_reached_at = ?,

            updated_at = ?

          WHERE id = ?;
        `,

        now,
        now,
        id
      );

      await recordBehaviorEvent(
        db,
        {
          type:
            "minimum_reached",

          promiseId:
            id,

          directionItemId:
            promise.directionItemId,

          metadata: {
            minimum:
              promise.minimum,
          },

          occurredAt:
            now,
        }
      );
    }
  );
}

async function markTargetReachedImpl(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  const promise =
    await getPromiseById(
      db,
      id
    );

  if (
    !promise ||
    promise.targetReachedAt ||
    promise.status === "missed" ||
    promise.status === "cancelled"
  ) {
    return;
  }

  const now =
    new Date(databaseNow(db)).toISOString();

  await db.withTransactionAsync(
    async () => {
      if (
        !promise.minimumReachedAt
      ) {
        await db.runAsync(
          `
            UPDATE promises
            SET
              status = 'kept',

              minimum_reached_at = ?,

              target_reached_at = ?,

              updated_at = ?

            WHERE id = ?;
          `,

          now,
          now,
          now,
          id
        );

        await recordBehaviorEvent(
          db,
          {
            type:
              "minimum_reached",

            promiseId:
              id,

            directionItemId:
              promise.directionItemId,

            metadata: {
              minimum:
                promise.minimum,

              reachedWhileCompletingTarget:
                true,
            },

            occurredAt:
              now,
          }
        );
      } else {
        await db.runAsync(
          `
            UPDATE promises
            SET
              target_reached_at = ?,

              updated_at = ?

            WHERE id = ?;
          `,

          now,
          now,
          id
        );
      }

      await recordBehaviorEvent(
        db,
        {
          type:
            "target_reached",

          promiseId:
            id,

          directionItemId:
            promise.directionItemId,

          metadata: {
            target:
              promise.target,
          },

          occurredAt:
            now,
        }
      );
    }
  );
}

async function markPromiseMissedImpl(
  db: SQLiteDatabase,
  id: number,
  reason: PromiseFailureReason,
  note?: string
): Promise<void> {
  const promise =
    await getPromiseById(
      db,
      id
    );

  if (
    !promise ||
    promise.status === "kept" ||
    promise.status === "cancelled"
  ) {
    return;
  }

  const now =
    new Date(databaseNow(db)).toISOString();

  await db.withTransactionAsync(
    async () => {
      await db.runAsync(
        `
          UPDATE promises
          SET
            status = 'missed',

            missed_at = ?,

            failure_reason = ?,

            failure_note = ?,

            updated_at = ?

          WHERE id = ?;
        `,

        now,
        reason,
        note?.trim() || null,
        now,
        id
      );

      await recordBehaviorEvent(
        db,
        {
          type:
            "promise_missed",

          promiseId:
            id,

          directionItemId:
            promise.directionItemId,

          metadata: {
            reason,

            note:
              note?.trim() ||
              null,
          },

          occurredAt:
            now,
        }
      );
    }
  );
}

async function cancelPromiseImpl(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  const promise =
    await getPromiseById(
      db,
      id
    );

  if (
    !promise ||
    promise.status === "kept" ||
    promise.status === "missed" ||
    promise.status === "cancelled"
  ) {
    return;
  }

  const now =
    new Date(databaseNow(db)).toISOString();

  await db.withTransactionAsync(
    async () => {
      await db.runAsync(
        `
          UPDATE promises
          SET
            status = 'cancelled',

            cancelled_at = ?,

            updated_at = ?

          WHERE id = ?;
        `,

        now,
        now,
        id
      );

      await recordBehaviorEvent(
        db,
        {
          type:
            "promise_cancelled",

          promiseId:
            id,

          directionItemId:
            promise.directionItemId,

          occurredAt:
            now,
        }
      );
    }
  );
}

async function reducePromiseMinimumImpl(
  db: SQLiteDatabase,
  id: number,
  nextMinimum: PromiseMeasure
): Promise<void> {
  const promise =
    await getPromiseById(
      db,
      id
    );

  if (
    !promise ||
    promise.status === "kept" ||
    promise.status === "missed" ||
    promise.status === "cancelled"
  ) {
    return;
  }

  const cleaned =
    cleanMeasure(
      nextMinimum
    );

  if (
    promise.minimum.kind !==
      "action" &&
    cleaned.kind ===
      promise.minimum.kind &&
    promise.minimum.amount !==
      null &&
    cleaned.amount !== null &&
    cleaned.amount >=
      promise.minimum.amount
  ) {
    throw new Error(
      "A reduced minimum must be smaller than the current minimum."
    );
  }

  const now =
    new Date(databaseNow(db)).toISOString();

  await db.withTransactionAsync(
    async () => {
      await db.runAsync(
        `
          UPDATE promises
          SET
            minimum_kind = ?,

            minimum_description = ?,

            minimum_amount = ?,

            minimum_unit = ?,

            updated_at = ?

          WHERE id = ?;
        `,

        cleaned.kind,
        cleaned.description,
        cleaned.amount,
        cleaned.unit,
        now,
        id
      );

      await recordBehaviorEvent(
        db,
        {
          type:
            "promise_minimum_reduced",

          promiseId:
            id,

          directionItemId:
            promise.directionItemId,

          metadata: {
            previousMinimum:
              promise.minimum,

            nextMinimum:
              cleaned,
          },

          occurredAt:
            now,
        }
      );
    }
  );
}
export const createPromise = coordinated(createPromiseImpl);
export const getPromiseById = coordinated(getPromiseByIdImpl);
export const getPromisesForDate = coordinated(getPromisesForDateImpl);
export const startPromise = coordinated(startPromiseImpl);
export const markMinimumReached = coordinated(markMinimumReachedImpl);
export const markTargetReached = coordinated(markTargetReachedImpl);
export const markPromiseMissed = coordinated(markPromiseMissedImpl);
export const cancelPromise = coordinated(cancelPromiseImpl);
export const reducePromiseMinimum = coordinated(reducePromiseMinimumImpl);
