import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyV3Schema } from "./fixtures/v3";
import type { SQLiteDatabase } from "expo-sqlite";
import { openTestDatabase } from "./sqliteAdapter";
import { migrateDatabase } from "../apps/mobile/src/database/migrate";
import { getContextState } from "../apps/mobile/src/database/contextRepository";
import { T } from "./persistenceContract";
const v3 = legacyV3Schema;
async function seed(db: SQLiteDatabase, version: number) {
  const marker = `PRAGMA user_version = ${version};`;
  await db.execAsync(v3.slice(0, v3.indexOf(marker) + marker.length));
  await db.runAsync(
    "INSERT INTO user_direction(id,statement,created_at,updated_at) VALUES(1,'My original words','2026-01-01','2026-01-01')",
  );
  if (version >= 2) {
    await db.execAsync(
      "UPDATE user_direction SET model_confirmed_at='2026-01-02'; INSERT INTO direction_items(user_direction_id,kind,title,status,created_at,updated_at) VALUES(1,'toward','Build','active','2026-01-01','2026-01-01');",
    );
  }
  if (version >= 3) {
    for (const status of [
      "planned",
      "active",
      "active",
      "kept",
      "missed",
      "cancelled",
    ])
      await db.runAsync(
        `INSERT INTO promises
      (direction_item_id,title,target_kind,target_description,target_amount,target_unit,minimum_kind,minimum_description,minimum_amount,minimum_unit,scheduled_date,scheduled_time,status,started_at,minimum_reached_at,created_at,updated_at)
      VALUES(1,?,'duration','Target',45,'minutes','duration','Minimum',5,'minutes','2026-10-25','19:00',?,'2026-10-25T19:00:00Z',?,'2026-01-01','2026-01-01')`,
        status,
        status,
        status === "kept" ? "2026-10-25T19:05:00Z" : null,
      );
    await db.execAsync(
      `INSERT INTO behavior_events(type,promise_id,direction_item_id,metadata_json,occurred_at) VALUES('promise_created',1,1,'{"original":true}','2026-01-01');`,
    );
  }
}
for (const version of [0, 1, 2, 3, 4])
  test(`upgrade v${version} preserves existing data and creates no intentions`, async () => {
    const db = openTestDatabase();
    try {
      if (version > 0 && version < 4) await seed(db, version);
      if (version === 4) await migrateDatabase(db);
      const tables =
        version === 0
          ? []
          : version === 1
            ? ["user_direction"]
            : version === 2
              ? ["user_direction", "direction_items"]
              : ["user_direction", "direction_items", "promises"];
      const before = await Promise.all(
        tables.map((t) => db.getAllAsync(`SELECT * FROM ${t} ORDER BY id`)),
      );
      if (version === 1)
        (before[0][0] as Record<string, unknown>).model_confirmed_at = null;
      await migrateDatabase(db);
      assert.equal(
        (
          await db.getFirstAsync<{ user_version: number }>(
            "PRAGMA user_version",
          )
        )?.user_version,
        4,
      );
      assert.deepEqual(
        await Promise.all(
          tables.map((t) => db.getAllAsync(`SELECT * FROM ${t} ORDER BY id`)),
        ),
        before,
      );
      assert.equal((await getContextState(db, T)).context, null);
      assert.equal(
        (
          await db.getFirstAsync<{ n: number }>(
            "SELECT COUNT(*) AS n FROM intention_contexts",
          )
        )?.n,
        0,
      );
      if (version === 3)
        assert.deepEqual(
          {
            ...(await db.getFirstAsync(
              "SELECT metadata_json,recorded_at,command_id FROM behavior_events",
            )),
          },
          {
            metadata_json: '{"original":true}',
            recorded_at: null,
            command_id: null,
          },
        );
      await migrateDatabase(db);
      assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
    } finally {
      await db.closeAsync();
    }
  });
for (const version of [2, 3])
  test(`interrupted v${version} upgrade stops at v3 and v4 retry is safe`, async () => {
    const db = openTestDatabase();
    try {
      await seed(db, version);
      const failing = new Proxy(db, {
        get(target, key) {
          if (key === "execAsync")
            return (sql: string) =>
              target.execAsync(
                sql.includes("CREATE TABLE application_commands")
                  ? sql.replace(
                      "CREATE TABLE assessment_reviews",
                      "INVALID SQL; CREATE TABLE assessment_reviews",
                    )
                  : sql,
              );
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as SQLiteDatabase;
      await assert.rejects(() => migrateDatabase(failing));
      assert.equal(
        (
          await db.getFirstAsync<{ user_version: number }>(
            "PRAGMA user_version",
          )
        )?.user_version,
        3,
      );
      assert.equal(
        await db.getFirstAsync(
          "SELECT name FROM sqlite_master WHERE name='application_commands'",
        ),
        null,
      );
      assert.ok(
        !(
          await db.getAllAsync<{ name: string }>(
            "PRAGMA table_info(behavior_events)",
          )
        ).some((r) => r.name === "recorded_at"),
      );
      await migrateDatabase(db);
      assert.equal(
        (
          await db.getFirstAsync<{ user_version: number }>(
            "PRAGMA user_version",
          )
        )?.user_version,
        4,
      );
    } finally {
      await db.closeAsync();
    }
  });
