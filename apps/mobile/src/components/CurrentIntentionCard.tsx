import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import type { ContextState } from "@alignment/types";
import { getContextState } from "../database/contextRepository";
import { getPromiseById } from "../database/promiseRepository";
import { executeCommand } from "../application/commands";
import { commandKey } from "../utils/contextTime";
import { Action, Card, ui } from "./contextUi";

export function CurrentIntentionCard() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [state, setState] = useState<ContextState | null>(null);
  const [kept, setKept] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const next = await getContextState(db, Date.now());
      const promise = next.context?.promiseId
        ? await getPromiseById(db, next.context.promiseId)
        : null;
      setState(next);
      setKept(promise?.status === "kept");
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read your intention.",
      );
    }
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (status) => {
      if (status === "active") void refresh();
    });
    const timeout = state?.context
      ? setTimeout(
          () => {
            void refresh();
          },
          Math.max(
            0,
            Math.min(2147483647, state.context.freshUntil - Date.now() + 1),
          ),
        )
      : undefined;
    return () => {
      listener.remove();
      if (timeout !== undefined) clearTimeout(timeout);
    };
  }, [refresh, state?.context]);
  async function end() {
    if (!state || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await executeCommand(db, {
        commandKey: commandKey(),
        expectedContextRevision: state.revision,
        command: { kind: "EndContext" },
      });
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not end this intention.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text style={ui.heading}>Current intention</Text>
      <Text style={ui.body}>
        {state?.context
          ? state.context.label ||
            (state.context.kind === "open" ? "Open time" : "Leisure")
          : "No current intention set."}
      </Text>
      {!state?.context && state?.mostRecentContext && (
        <Text style={ui.muted}>Your earlier intention may have changed.</Text>
      )}
      {state?.context && (
        <>
          {state.context.plannedUntil !== null && (
            <Text style={ui.muted}>
              Expected until{" "}
              {new Date(state.context.plannedUntil).toLocaleTimeString()}.
            </Text>
          )}
          <Text style={ui.muted}>
            Check whether this is still current at{" "}
            {new Date(state.context.freshUntil).toLocaleTimeString()}. You can
            change plans at any time.
          </Text>
          {kept && (
            <Text style={ui.body}>Promise kept. Continuing is optional.</Text>
          )}
          {state.context.kind === "open" && (
            <Text style={ui.muted}>
              You chose flexible time. Alignment will not infer drift from this
              context.
            </Text>
          )}
          <Action
            label="Revise or extend"
            onPress={() => router.push("/context?mode=revise")}
          />
          <Action
            label="End current intention"
            onPress={() => {
              void end();
            }}
            disabled={busy}
          />
        </>
      )}
      <Action
        label={state?.context ? "Switch intention" : "Choose current intention"}
        onPress={() => router.push("/context")}
      />
      <Action
        label="Review what happened"
        onPress={() => router.push("/context-review")}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      )}
    </Card>
  );
}
