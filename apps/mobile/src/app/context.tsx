import { useCallback, useRef, useState } from "react";
import { ScrollView, Text } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import type {
  AlignmentPromise,
  ContextKind,
  ContextState,
} from "@alignment/types";
import { executeCommand, type AlignmentCommand } from "../application/commands";
import { getContextState } from "../database/contextRepository";
import {
  getPromiseById,
  getPromisesForDate,
} from "../database/promiseRepository";
import { Action, Choices, Field, ui } from "../components/contextUi";
import { commandKey, minutesFromNow, timeZone } from "../utils/contextTime";
import { getLocalDateKey } from "../utils/date";

export default function ContextScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{
    promiseId?: string;
    mode?: string;
    completeMinimum?: string;
  }>();
  const [state, setState] = useState<ContextState | null>(null);
  const [promises, setPromises] = useState<AlignmentPromise[]>([]);
  const [selected, setSelected] = useState<AlignmentPromise | null>(null);
  const [kind, setKind] = useState<ContextKind>(
    params.completeMinimum ? "leisure" : "activity",
  );
  const [label, setLabel] = useState("");
  const [freshMinutes, setFreshMinutes] = useState("60");
  const [plannedMinutes, setPlannedMinutes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [completing, setCompleting] = useState<AlignmentPromise | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const next = await getContextState(db, Date.now());
          const rows = await getPromisesForDate(db, getLocalDateKey());
          const requested = params.promiseId
            ? await getPromiseById(db, Number(params.promiseId))
            : null;
          const currentPromise = next.context?.promiseId
            ? await getPromiseById(db, next.context.promiseId)
            : null;
          if (!active) return;
          setState(next);
          setPromises(
            rows.filter((p) => !["missed", "cancelled"].includes(p.status)),
          );
          if (params.completeMinimum) {
            setCompleting(requested);
            setSelected(null);
          } else if (params.mode === "revise" && next.context) {
            setKind(next.context.kind);
            setLabel(next.context.label);
            setSelected(currentPromise);
            setFreshMinutes(
              String(
                Math.max(
                  1,
                  Math.ceil((next.context.freshUntil - Date.now()) / 60000),
                ),
              ),
            );
            setPlannedMinutes(
              next.context.plannedUntil &&
                next.context.plannedUntil > Date.now()
                ? String(
                    Math.ceil((next.context.plannedUntil - Date.now()) / 60000),
                  )
                : "",
            );
          } else if (requested) {
            setSelected(requested);
            setLabel(requested.title);
          }
        } catch (e) {
          if (active)
            setError(
              e instanceof Error ? e.message : "Could not load intentions.",
            );
        }
      })();
      return () => {
        active = false;
      };
    }, [db, params.promiseId, params.mode, params.completeMinimum]),
  );
  async function save() {
    if (!state || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const now = Date.now();
      const context = {
        kind,
        label,
        promiseId: kind === "activity" ? (selected?.id ?? null) : null,
        plannedUntil: plannedMinutes.trim()
          ? minutesFromNow(plannedMinutes, now)
          : null,
        freshUntil: minutesFromNow(freshMinutes, now),
        timeZone: timeZone(),
      };
      let command: AlignmentCommand;
      if (completing)
        command = {
          kind: "ReachMinimumAndSwitchContext",
          promiseId: completing.id,
          context,
        };
      else if (params.mode === "revise")
        command = { kind: "ReviseContext", context };
      else if (context.promiseId && selected)
        command = {
          kind:
            selected.status === "planned"
              ? "StartPromiseAndActivateContext"
              : "ResumePromiseContext",
          promiseId: selected.id,
          context,
        };
      else command = { kind: "ActivateContext", context };
      await executeCommand(
        db,
        {
          commandKey: commandKey(),
          expectedContextRevision: state.revision,
          command,
        },
        now,
      );
      router.back();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save this intention.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={ui.page}>
      <Text style={ui.title}>
        {completing ? "Keep the minimum and switch" : "Choose what matters now"}
      </Text>
      <Text style={ui.body}>
        This describes your current choice. It does not create a new obligation.
      </Text>
      <Choices
        value={kind}
        options={[
          { value: "activity", label: "Activity" },
          { value: "leisure", label: "Leisure" },
          { value: "open", label: "Open time" },
        ]}
        onChange={(value) => {
          setKind(value);
          setSelected(null);
          setLabel("");
        }}
      />
      {kind === "activity" && (
        <>
          <Text style={ui.label}>Link a promise (optional)</Text>
          <Action
            label={
              selected
                ? "Use an unlinked activity instead"
                : "No promise selected"
            }
            onPress={() => setSelected(null)}
          />
          {promises.map((p) => (
            <Action
              key={p.id}
              label={`${selected?.id === p.id ? "Selected: " : ""}${p.title}${p.status === "kept" ? " — already kept" : ""}`}
              onPress={() => {
                setSelected(p);
                setLabel(p.title);
              }}
            />
          ))}
        </>
      )}
      {selected?.status === "kept" && (
        <Text style={ui.body}>Promise kept. Continuing is optional.</Text>
      )}
      {kind === "open" && (
        <Text style={ui.body}>
          Flexible time is a deliberate choice. This context cannot cause
          inferred drift.
        </Text>
      )}
      <Field
        label={
          kind === "activity"
            ? "What are you choosing to do?"
            : "Description (optional)"
        }
        value={label}
        onChange={setLabel}
      />
      <Field
        label="Expected duration in minutes (optional)"
        value={plannedMinutes}
        onChange={setPlannedMinutes}
      />
      <Field
        label="Check whether this is still current in how many minutes?"
        value={freshMinutes}
        onChange={setFreshMinutes}
      />
      <Text style={ui.muted}>
        After that checkpoint, Alignment stops assuming this is your current
        intention. You can continue, extend it, or change plans.
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      )}
      <Action
        label={
          busy
            ? "Saving…"
            : completing
              ? "Mark minimum kept and switch"
              : "Use this intention now"
        }
        onPress={() => {
          void save();
        }}
        disabled={busy || !state}
      />
      <Action label="Back" onPress={() => router.back()} />
    </ScrollView>
  );
}
