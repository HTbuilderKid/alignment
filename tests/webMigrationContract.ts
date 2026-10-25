import type { SQLiteDatabase } from "expo-sqlite";
import { migrateDatabase } from "../apps/mobile/src/database/migrate";
import { legacyV3Schema } from "./fixtures/v3";
import { equal, rejects } from "./persistenceContract";
export async function runWebMigrationContract(
  open: () => Promise<SQLiteDatabase>,
) {
  const results: { name: string; passed: boolean; error?: string }[] = [];
  for (const version of [1, 2, 3]) {
    const db = await open();
    try {
      const marker = `PRAGMA user_version = ${version};`;
      await db.execAsync(
        legacyV3Schema.slice(0, legacyV3Schema.indexOf(marker) + marker.length),
      );
      await db.runAsync(
        "INSERT INTO user_direction(id,statement,created_at,updated_at) VALUES(1,'Original words','2026-01-01','2026-01-01')",
      );
      if (version === 3)
        await db.execAsync(
          "INSERT INTO behavior_events(type,metadata_json,occurred_at) VALUES('promise_created','{\"legacy\":true}','2026-01-01');",
        );
      await migrateDatabase(db);
      equal(
        (
          await db.getFirstAsync<{ user_version: number }>(
            "PRAGMA user_version",
          )
        )?.user_version,
        4,
      );
      equal(
        (
          await db.getFirstAsync<{ statement: string }>(
            "SELECT statement FROM user_direction",
          )
        )?.statement,
        "Original words",
      );
      equal(
        (
          await db.getFirstAsync<{ n: number }>(
            "SELECT COUNT(*) AS n FROM intention_contexts",
          )
        )?.n,
        0,
      );
      if (version === 3)
        equal(
          (
            await db.getFirstAsync<{ recorded_at: string | null }>(
              "SELECT recorded_at FROM behavior_events",
            )
          )?.recorded_at,
          null,
        );
      await migrateDatabase(db);
      equal(await db.getAllAsync("PRAGMA foreign_key_check"), []);
      results.push({
        name: `Expo web v${version} migration and reopen`,
        passed: true,
      });
    } catch (e) {
      results.push({
        name: `Expo web v${version} migration and reopen`,
        passed: false,
        error: String(e),
      });
    } finally {
      await db.closeAsync();
    }
  }
  const db = await open();
  try {
    await db.execAsync(legacyV3Schema);
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
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await rejects(() => migrateDatabase(failing));
    equal(
      (await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))
        ?.user_version,
      3,
    );
    equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name='application_commands'",
      ),
      null,
    );
    await migrateDatabase(db);
    equal(
      (await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))
        ?.user_version,
      4,
    );
    results.push({
      name: "Expo web interrupted migration and retry",
      passed: true,
    });
  } catch (e) {
    results.push({
      name: "Expo web interrupted migration and retry",
      passed: false,
      error: String(e),
    });
  } finally {
    await db.closeAsync();
  }
  return results;
}
