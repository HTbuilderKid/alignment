import type { SQLiteDatabase } from "expo-sqlite";

const queues = new WeakMap<SQLiteDatabase, Promise<unknown>>();
const scopes = new WeakMap<
  SQLiteDatabase,
  { active: boolean; now: number; commandId: number | null }
>();

/** All application DB access uses this coordinator, including legacy repositories.
 * The callback's handle joins this transaction; it never opens an inner one.
 * Never retain that handle after the callback or issue SQL on the raw connection.
 */
export async function withDatabaseTransaction<T>(
  db: SQLiteDatabase,
  task: (tx: SQLiteDatabase) => Promise<T>,
  now?: number,
): Promise<T> {
  const existing = scopes.get(db);
  if (existing) {
    if (!existing.active)
      throw new Error("Transaction handle is no longer active.");
    return task(db);
  }
  const previous = queues.get(db) ?? Promise.resolve();
  const pending = previous
    .catch(() => undefined)
    .then(async () => {
      const scope = {
        active: true,
        now: now ?? Date.now(),
        commandId: null as number | null,
      };
      const tx = new Proxy(db, {
        get(target, property) {
          if (property === "withTransactionAsync")
            return async (callback: () => Promise<void>) => {
              if (!scope.active)
                throw new Error("Transaction handle is no longer active.");
              await callback();
            };
          const value = Reflect.get(target, property, target);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            if (!scope.active)
              throw new Error("Transaction handle is no longer active.");
            return value.apply(target, args);
          };
        },
      });
      scopes.set(tx, scope);
      try {
        await db.execAsync("BEGIN IMMEDIATE");
        try {
          const result = await task(tx);
          await db.execAsync("COMMIT");
          return result;
        } catch (error) {
          await db.execAsync("ROLLBACK");
          throw error;
        }
      } finally {
        scope.active = false;
      }
    });
  queues.set(db, pending);
  return pending;
}

/** Queue an initialization operation that must run outside a transaction (PRAGMA). */
export async function initializeDatabase<T>(
  db: SQLiteDatabase,
  task: () => Promise<T>,
): Promise<T> {
  const pending = (queues.get(db) ?? Promise.resolve())
    .catch(() => undefined)
    .then(task);
  queues.set(db, pending);
  return pending;
}
export function coordinated<Args extends unknown[], T>(
  operation: (db: SQLiteDatabase, ...args: Args) => Promise<T>,
) {
  return (db: SQLiteDatabase, ...args: Args): Promise<T> =>
    withDatabaseTransaction(db, (tx) => operation(tx, ...args));
}
export function databaseNow(db: SQLiteDatabase): number {
  return scopes.get(db)?.now ?? Date.now();
}
export function setCommandId(db: SQLiteDatabase, id: number): void {
  const scope = scopes.get(db);
  if (!scope?.active)
    throw new Error("Command requires an active transaction.");
  scope.commandId = id;
}
export function commandIdFor(db: SQLiteDatabase): number | null {
  return scopes.get(db)?.commandId ?? null;
}
