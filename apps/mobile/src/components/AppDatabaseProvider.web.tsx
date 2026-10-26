import { Component, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text } from "react-native";
import { SQLiteProvider } from "expo-sqlite";
import { migrateDatabase } from "../database/migrate";
import {
  acquireBrowserDatabaseLease,
  isBrowserDatabaseLockError,
} from "../database/browserLease";
import { Action, Card, ui } from "./contextUi";

class DatabaseStartupError extends Error {
  constructor(readonly original: Error) {
    super(original.message);
    this.name = "DatabaseStartupError";
  }
}
// SQLiteProvider calls onError during render. Throw into a boundary; never set
// parent state in that callback or remount against a partially initialized VFS.
function handleStartupError(error: Error): never {
  throw new DatabaseStartupError(error);
}
function StartupFailure({ error }: { error: Error }) {
  const locked = isBrowserDatabaseLockError(error);
  return (
    <ScrollView contentContainerStyle={ui.page}>
      <Card>
        <Text accessibilityRole="header" style={ui.title}>
          {locked ? "Local data is still in use" : "Could not open local data"}
        </Text>
        <Text style={ui.body}>
          {locked
            ? "Another Alignment tab or an earlier browser session still has your local data open. Close the other Alignment tabs at this address, wait a few seconds, then try again."
            : "Alignment could not open your local database. You can retry without resetting it. If this continues, share the message below."}
        </Text>
        <Text style={ui.body}>
          Do not clear site data. It contains your goals and promises.
        </Text>
        {!locked && (
          <Text selectable style={ui.muted}>
            {error.message}
          </Text>
        )}
        <Action label="Try again" onPress={() => window.location.reload()} />
      </Card>
    </ScrollView>
  );
}
class StartupBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      // Do not disguise application rendering bugs as storage-lock failures.
      if (!(this.state.error instanceof DatabaseStartupError))
        throw this.state.error;
      return <StartupFailure error={this.state.error.original} />;
    }
    return this.props.children;
  }
}

export function AppDatabaseProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let mounted = true;
    acquireBrowserDatabaseLease().then(
      () => {
        if (mounted) setReady(true);
      },
      (failure) => {
        if (mounted)
          setError(
            failure instanceof Error ? failure : new Error(String(failure)),
          );
      },
    );
    // The lease belongs to this document, not to a component mount. Fast Refresh
    // and Strict Mode reuse the global promise instead of opening another worker.
    return () => {
      mounted = false;
    };
  }, []);
  if (error) return <StartupFailure error={error} />;
  if (!ready)
    return (
      <ScrollView contentContainerStyle={ui.page}>
        <Card>
          <Text accessibilityRole="header" style={ui.title}>
            Waiting to open your local data
          </Text>
          <ActivityIndicator accessibilityLabel="Waiting for local database access" />
          <Text style={ui.body}>
            If Alignment is open in another tab at this address, close that tab.
            This tab will continue automatically.
          </Text>
          <Text style={ui.muted}>
            Your goals and promises stay in this browser. There is no need to
            clear site data.
          </Text>
        </Card>
      </ScrollView>
    );
  return (
    <StartupBoundary>
      <SQLiteProvider
        databaseName="alignment.db"
        onInit={migrateDatabase}
        onError={handleStartupError}
      >
        {children}
      </SQLiteProvider>
    </StartupBoundary>
  );
}
