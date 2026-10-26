import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppDatabaseProvider } from "../components/AppDatabaseProvider";

export default function RootLayout() {
  return (
    <AppDatabaseProvider>
      <StatusBar style="auto" />

      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </AppDatabaseProvider>
  );
}