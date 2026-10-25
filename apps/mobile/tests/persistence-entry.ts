/** Browser-only test entry. Not imported by any app route or production bundle. */
import { deleteDatabaseAsync, openDatabaseAsync } from "expo-sqlite";
import { runWebMigrationContract } from "../../../tests/webMigrationContract";
import { runPersistenceContract } from "../../../tests/persistenceContract";

let sequence = 0;
const open = async () => {
  const name = `alignment-contract-${Date.now()}-${++sequence}.db`;
  const db = await openDatabaseAsync(name);
  const originalClose = db.closeAsync.bind(db);
  db.closeAsync = async () => {
    await originalClose();
    await deleteDatabaseAsync(name);
  };
  return db;
};
const run = (async () => [
  ...(await runPersistenceContract(open)),
  ...(await runWebMigrationContract(open)),
])();
(globalThis as unknown as { step6Contract: typeof run }).step6Contract = run;
