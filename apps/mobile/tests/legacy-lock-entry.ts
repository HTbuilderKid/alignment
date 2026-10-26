/** Test-only entry: simulate a tab running the older app without a Web Lock.
 * It deliberately keeps the worker alive but never modifies or deletes data.
 * Not imported by any application route or production bundle.
 */
import { openDatabaseAsync } from "expo-sqlite";

const opened = openDatabaseAsync("alignment.db").then(() => true);
(
  globalThis as unknown as { legacySQLiteReady: typeof opened }
).legacySQLiteReady = opened;
