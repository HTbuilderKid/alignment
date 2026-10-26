import type { ReactNode } from "react";
import { SQLiteProvider } from "expo-sqlite";
import { migrateDatabase } from "../database/migrate";

/** Native provider. Browser ownership coordination lives in the .web variant. */
export function AppDatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName="alignment.db" onInit={migrateDatabase}>
      {children}
    </SQLiteProvider>
  );
}
