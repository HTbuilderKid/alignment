import type { SQLiteDatabase } from "expo-sqlite";
import type { ContextDraft } from "@alignment/types";
import { migrateDatabase } from "../apps/mobile/src/database/migrate";
import {
  executeCommand,
  type AlignmentCommand,
} from "../apps/mobile/src/application/commands";
import {
  getAssessment,
  getContextRevision,
  getContextState,
  getLatestAssessment,
  getTimeline,
} from "../apps/mobile/src/database/contextRepository";
import {
  createPromise,
  getPromiseById,
} from "../apps/mobile/src/database/promiseRepository";
import { withDatabaseTransaction } from "../apps/mobile/src/database/coordinator";

export function equal(
  actual: unknown,
  expected: unknown,
  message = "Values differ",
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
}
export async function rejects(task: () => Promise<unknown>, match?: string) {
  try {
    await task();
  } catch (e) {
    // Expo web currently masks SQLite trigger messages while finalizing a failed statement.
    // The assertions after each rejection still verify the complete rollback.
    if (
      match &&
      !String(e).includes(match) &&
      !String(e).includes("Error finalizing statement")
    )
      throw e;
    return;
  }
  throw new Error("Expected operation to reject.");
}
export const T = Date.UTC(2026, 9, 25, 19);
export const M = 60_000;
export const draft = (
  kind: ContextDraft["kind"] = "activity",
  freshUntil = T + 90 * M,
  promiseId: number | null = null,
): ContextDraft => ({
  kind,
  label: kind === "activity" ? "Work on Alignment" : kind,
  freshUntil,
  plannedUntil: T + 30 * M,
  promiseId,
  timeZone: "UTC",
});
export async function promise(db: SQLiteDatabase) {
  return createPromise(db, {
    title: "Build Alignment",
    directionItemId: null,
    scheduledDate: "2026-10-25",
    minimum: {
      kind: "duration",
      amount: 5,
      unit: "minutes",
      description: "Five minutes",
    },
    target: {
      kind: "duration",
      amount: 45,
      unit: "minutes",
      description: "Forty-five minutes",
    },
  });
}
let sequence = 0;
export async function command(
  db: SQLiteDatabase,
  value: AlignmentCommand,
  now = T,
) {
  return executeCommand(
    db,
    {
      commandKey: `contract-${++sequence}`,
      expectedContextRevision: await getContextRevision(db),
      command: value,
    },
    now,
  );
}
export const persistenceCases: {
  name: string;
  run: (db: SQLiteDatabase) => Promise<void>;
}[] = [
  {
    name: "minimum fulfillment preserves intention and freshness",
    async run(db) {
      const id = await promise(db);
      await command(db, {
        kind: "StartPromiseAndActivateContext",
        promiseId: id,
        context: draft("activity", T + 90 * M, id),
      });
      const before = await getContextState(db, T + M);
      await command(
        db,
        { kind: "ReachPromiseMinimum", promiseId: id },
        T + 5 * M,
      );
      equal((await getPromiseById(db, id))?.status, "kept");
      equal((await getContextState(db, T + 6 * M)).context, before.context);
      equal(
        (await getContextState(db, T + 31 * M)).context?.id,
        before.context?.id,
        "Planned end does not expire freshness",
      );
      equal((await getContextState(db, T + 90 * M)).context, null);
    },
  },
  {
    name: "minimum and leisure switch are atomic without resurrecting work",
    async run(db) {
      const id = await promise(db);
      await command(db, {
        kind: "StartPromiseAndActivateContext",
        promiseId: id,
        context: draft("activity", T + 90 * M, id),
      });
      await command(
        db,
        {
          kind: "ReachMinimumAndSwitchContext",
          promiseId: id,
          context: draft("leisure", T + 20 * M),
        },
        T + 5 * M,
      );
      equal((await getPromiseById(db, id))?.status, "kept");
      equal((await getContextState(db, T + 6 * M)).context?.kind, "leisure");
      equal((await getContextState(db, T + 21 * M)).context, null);
    },
  },
  {
    name: "failed context insertion rolls back promise, events, and receipt",
    async run(db) {
      const id = await promise(db);
      await db.execAsync(
        `CREATE TRIGGER fail_context BEFORE INSERT ON intention_contexts BEGIN SELECT RAISE(ABORT,'injected context failure'); END;`,
      );
      const request = {
        commandKey: "rollback",
        expectedContextRevision: 0,
        command: {
          kind: "StartPromiseAndActivateContext",
          promiseId: id,
          context: draft("activity", T + 90 * M, id),
        } as AlignmentCommand,
      };
      await rejects(
        () => executeCommand(db, request, T),
        "injected context failure",
      );
      equal((await getPromiseById(db, id))?.status, "planned");
      equal(await getContextRevision(db), 0);
      equal(
        (
          await db.getFirstAsync<{ n: number }>(
            "SELECT COUNT(*) AS n FROM behavior_events WHERE type='promise_started'",
          )
        )?.n,
        0,
      );
      await db.execAsync("DROP TRIGGER fail_context");
      const first = await executeCommand(db, request, T);
      equal(
        await executeCommand(db, request, T + M),
        first,
        "Retry returns original result",
      );
      await rejects(
        () =>
          executeCommand(
            db,
            { ...request, command: { kind: "EndContext" } },
            T + M,
          ),
        "different input",
      );
    },
  },
  {
    name: "failed event insertion rolls back both minimum and context switch",
    async run(db) {
      const id = await promise(db);
      await command(db, {
        kind: "StartPromiseAndActivateContext",
        promiseId: id,
        context: draft("activity", T + 90 * M, id),
      });
      const before = await getContextState(db, T + M);
      await db.execAsync(
        `CREATE TRIGGER fail_event BEFORE INSERT ON behavior_events WHEN NEW.type='context_declared' BEGIN SELECT RAISE(ABORT,'event failure'); END;`,
      );
      await rejects(
        () =>
          command(
            db,
            {
              kind: "ReachMinimumAndSwitchContext",
              promiseId: id,
              context: draft("leisure"),
            },
            T + 5 * M,
          ),
        "event failure",
      );
      equal((await getPromiseById(db, id))?.status, "active");
      equal(await getContextState(db, T + M), before);
    },
  },
  {
    name: "retrospective correction preserves as-known history and original assessments",
    async run(db) {
      const first = await command(db, {
        kind: "ActivateContext",
        context: draft(),
      });
      const report = await command(
        db,
        {
          kind: "RecordBehaviorReport",
          report: {
            start: T + 35 * M,
            end: T + 40 * M,
            description: "Watching a video",
            relation: "conflicting",
            deliberateness: "unsure",
            contextId: null,
          },
        },
        T + 45 * M,
      );
      const initial = await getAssessment(db, report.assessmentId!);
      equal(initial?.segments[0].outcome, "possible_drift");
      await command(
        db,
        {
          kind: "ReviewAssessment",
          review: {
            assessmentId: initial!.id,
            start: T + 35 * M,
            end: T + 40 * M,
            response: "plans_changed",
            explanation: "I had chosen a break",
            supersedesReviewId: null,
          },
          correction: {
            start: T + 35 * M,
            end: T + 40 * M,
            replacement: {
              ...draft("leisure", T + 40 * M),
              plannedUntil: null,
            },
          },
        },
        T + 60 * M,
      );
      const current = await getTimeline(db);
      const corrected = current.contexts.find((c) => c.kind === "leisure")!;
      equal(corrected.recordedAt, T + 60 * M);
      equal(
        current.intervals
          .filter((i) => i.contextId === corrected.id)
          .map((i) => [i.start, i.end]),
        [[T + 35 * M, T + 40 * M]],
      );
      equal((await getTimeline(db, first.revision)).intervals.length, 1);
      equal(await getAssessment(db, initial!.id), initial);
      equal(
        (await getLatestAssessment(db, report.reportId!))?.segments[0].outcome,
        "unknown",
      );
      equal(
        (await getContextState(db, T + 61 * M)).context?.kind,
        "activity",
        "Bounded historical correction leaves the present unchanged",
      );
    },
  },
  {
    name: "open context suppresses inferred adversity but allows explicit unwanted self-report",
    async run(db) {
      await command(db, { kind: "ActivateContext", context: draft("open") });
      const input = {
        start: T + M,
        end: T + 2 * M,
        description: "Browsing",
        relation: "conflicting" as const,
        deliberateness: "unsure" as const,
        contextId: null,
      };
      const a = await command(
        db,
        { kind: "RecordBehaviorReport", report: input },
        T + 3 * M,
      );
      equal(
        (await getAssessment(db, a.assessmentId!))?.segments[0].outcome,
        "unknown",
      );
      const b = await command(
        db,
        {
          kind: "RecordBehaviorReport",
          report: { ...input, deliberateness: "unintended" },
        },
        T + 4 * M,
      );
      equal(
        (await getAssessment(db, b.assessmentId!))?.segments[0].outcome,
        "confirmed_drift",
      );
    },
  },
  {
    name: "partial and superseding reviews preserve untouched intervals",
    async run(db) {
      await command(db, { kind: "ActivateContext", context: draft() });
      const report = await command(
        db,
        {
          kind: "RecordBehaviorReport",
          report: {
            start: T + M,
            end: T + 10 * M,
            description: "",
            relation: "conflicting",
            deliberateness: "unsure",
            contextId: null,
          },
        },
        T + 11 * M,
      );
      const review = {
        assessmentId: report.assessmentId!,
        start: T + 3 * M,
        end: T + 5 * M,
        response: "supporting_purpose" as const,
        explanation: "Tutorial",
        supersedesReviewId: null,
      };
      const a = await command(
        db,
        { kind: "ReviewAssessment", review },
        T + 12 * M,
      );
      equal(
        (await getAssessment(db, a.assessmentId!))?.segments.map(
          (s) => s.outcome,
        ),
        ["possible_drift", "consistent", "possible_drift"],
      );
      const b = await command(
        db,
        {
          kind: "ReviewAssessment",
          review: {
            ...review,
            assessmentId: a.assessmentId!,
            response: "unintended",
            supersedesReviewId: a.reviewId!,
          },
        },
        T + 13 * M,
      );
      equal(
        (await getAssessment(db, b.assessmentId!))?.segments.map(
          (s) => s.outcome,
        ),
        ["possible_drift", "confirmed_drift", "possible_drift"],
      );
    },
  },
  {
    name: "conflicting activations serialize and stale revision loses without partial state",
    async run(db) {
      const results = await Promise.allSettled([
        executeCommand(
          db,
          {
            commandKey: "race-a",
            expectedContextRevision: 0,
            command: { kind: "ActivateContext", context: draft() },
          },
          T,
        ),
        executeCommand(
          db,
          {
            commandKey: "race-b",
            expectedContextRevision: 0,
            command: { kind: "ActivateContext", context: draft("leisure") },
          },
          T,
        ),
      ]);
      equal(
        results.map((r) => r.status),
        ["fulfilled", "rejected"],
      );
      equal((await getTimeline(db)).intervals.length, 1);
      const timeline = await getTimeline(db);
      const i = timeline.intervals[0];
      await rejects(
        () =>
          db.runAsync(
            `INSERT INTO context_interval_versions(context_id,effective_start,effective_end,introduced_revision,end_reason) VALUES(?,?,?,?,'freshness')`,
            i.contextId,
            i.start,
            i.end,
            i.introducedRevision,
          ),
        "overlap",
      );
    },
  },
  {
    name: "historical correction plus present continuation does not leave overlapping intermediate versions",
    async run(db) {
      await command(db, { kind: "ActivateContext", context: draft() });
      await command(
        db,
        {
          kind: "CorrectHistoricalContext",
          correction: {
            start: T + 10 * M,
            end: T + 20 * M,
            replacement: {
              ...draft("leisure", T + 20 * M),
              plannedUntil: null,
            },
            continueNow: draft("leisure", T + 40 * M),
          },
        },
        T + 20 * M,
      );
      const timeline = await getTimeline(db);
      equal(
        timeline.intervals
          .sort((a, b) => a.start - b.start)
          .map((i) => [i.start, i.end]),
        [
          [T, T + 10 * M],
          [T + 10 * M, T + 20 * M],
          [T + 20 * M, T + 40 * M],
        ],
      );
      equal((await getContextState(db, T + 41 * M)).context, null);
    },
  },
  {
    name: "reads wait for compound writes and scoped handles cannot escape",
    async run(db) {
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      let entered!: () => void;
      const ready = new Promise<void>((r) => {
        entered = r;
      });
      let escaped: SQLiteDatabase | undefined;
      const writing = withDatabaseTransaction(db, async (tx) => {
        escaped = tx;
        entered();
        await gate;
        return promise(tx);
      });
      await ready;
      let readFinished = false;
      const reading = getContextState(db, T).then(() => {
        readFinished = true;
      });
      await Promise.resolve();
      equal(readFinished, false);
      release();
      await writing;
      await reading;
      await rejects(async () => {
        await escaped!.getFirstAsync("SELECT 1");
      }, "no longer active");
    },
  },
  {
    name: "failed reassessment rolls back retrospective timeline correction",
    async run(db) {
      await command(db, { kind: "ActivateContext", context: draft() });
      const r = await command(
        db,
        {
          kind: "RecordBehaviorReport",
          report: {
            start: T + M,
            end: T + 2 * M,
            description: "",
            relation: "unclear",
            deliberateness: "unsure",
            contextId: null,
          },
        },
        T + 3 * M,
      );
      const before = await getTimeline(db);
      await db.execAsync(
        `CREATE TRIGGER fail_assessment BEFORE INSERT ON drift_assessments BEGIN SELECT RAISE(ABORT,'assessment failure'); END;`,
      );
      await rejects(
        () =>
          command(
            db,
            {
              kind: "CorrectHistoricalContext",
              correction: {
                start: T + M,
                end: T + 2 * M,
                replacement: {
                  ...draft("open", T + 2 * M),
                  plannedUntil: null,
                },
              },
            },
            T + 4 * M,
          ),
        "assessment failure",
      );
      equal(await getTimeline(db), before);
      equal((await getLatestAssessment(db, r.reportId!))?.id, r.assessmentId);
    },
  },
];
export async function runPersistenceContract(
  open: () => Promise<SQLiteDatabase>,
) {
  const results: { name: string; passed: boolean; error?: string }[] = [];
  for (const scenario of persistenceCases) {
    const db = await open();
    try {
      await migrateDatabase(db);
      await scenario.run(db);
      results.push({ name: scenario.name, passed: true });
    } catch (e) {
      results.push({ name: scenario.name, passed: false, error: String(e) });
    } finally {
      await db.closeAsync();
    }
  }
  return results;
}
