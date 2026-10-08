import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SQLiteProvider } from "expo-sqlite";

import { migrateDatabase } from "../database/migrate";

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="alignment.db"
      onInit={migrateDatabase}
    >
      <StatusBar style="auto" />

      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </SQLiteProvider>
  );
}