import { test } from "node:test";
import { openTestDatabase } from "./sqliteAdapter";
import { migrateDatabase } from "../apps/mobile/src/database/migrate";
import { persistenceCases } from "./persistenceContract";
for (const scenario of persistenceCases)
  test(scenario.name, async () => {
    const db = openTestDatabase();
    try {
      await migrateDatabase(db);
      await scenario.run(db);
    } finally {
      await db.closeAsync();
    }
  });

test("clock rollback cannot silently turn a current command into a historical correction", async () => {
  const { command, draft, T, M, rejects, equal } = await import(
    "./persistenceContract"
  );
  const { getTimeline } = await import(
    "../apps/mobile/src/database/contextRepository"
  );
  const db = openTestDatabase();
  try {
    await migrateDatabase(db);
    await command(db, { kind: "ActivateContext", context: draft() }, T);
    const before = await getTimeline(db);
    await rejects(
      () =>
        command(
          db,
          { kind: "ActivateContext", context: draft("leisure") },
          T - M,
        ),
      "clock moved backward",
    );
    equal(await getTimeline(db), before);
  } finally {
    await db.closeAsync();
  }
});
