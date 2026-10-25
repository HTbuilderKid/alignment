import type { SQLiteDatabase } from "expo-sqlite";
import type {
  AssessmentReviewInput,
  BehaviorReportInput,
  ContextDraft,
  ContextIntervalVersion,
  IntentionContext,
} from "@alignment/types";
import {
  assertInstant,
  assertRange,
  assess,
  contextAt,
  EVALUATOR_VERSION,
  replaceInterval,
  validateContext,
} from "@alignment/engine";
import {
  databaseNow,
  setCommandId,
  withDatabaseTransaction,
} from "../database/coordinator";
import {
  getAssessment,
  getContextRevision,
  getLatestAssessment,
  getReport,
  getReviews,
  getTimeline,
} from "../database/contextRepository";
import {
  getPromiseById,
  markMinimumReached,
  startPromise,
} from "../database/promiseRepository";
import { recordBehaviorEvent } from "../database/behaviorEventRepository";

export type HistoricalCorrection = {
  start: number;
  end: number;
  replacement: ContextDraft | null;
  /** A separate present declaration; historical coverage never silently resumes work. */
  continueNow?: ContextDraft;
};
export type AlignmentCommand =
  | { kind: "ActivateContext" | "ReviseContext"; context: ContextDraft }
  | { kind: "EndContext" }
  | {
      kind: "StartPromiseAndActivateContext" | "ResumePromiseContext";
      promiseId: number;
      context: ContextDraft;
    }
  | { kind: "ReachPromiseMinimum"; promiseId: number }
  | {
      kind: "ReachMinimumAndSwitchContext";
      promiseId: number;
      context: ContextDraft;
    }
  | { kind: "RecordBehaviorReport"; report: BehaviorReportInput }
  | {
      kind: "ReviewAssessment";
      review: AssessmentReviewInput;
      correction?: HistoricalCorrection;
      nextContext?: ContextDraft;
    }
  | { kind: "CorrectHistoricalContext"; correction: HistoricalCorrection };
export type CommandRequest = {
  commandKey: string;
  expectedContextRevision: number;
  command: AlignmentCommand;
};
export type CommandResult = {
  revision: number;
  contextId?: number;
  reportId?: number;
  assessmentId?: number;
  reviewId?: number;
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function changesContext(command: AlignmentCommand): boolean {
  return (
    ![
      "ReachPromiseMinimum",
      "RecordBehaviorReport",
      "ReviewAssessment",
    ].includes(command.kind) ||
    (command.kind === "ReviewAssessment" &&
      !!(command.correction || command.nextContext))
  );
}
async function declare(
  db: SQLiteDatabase,
  draft: ContextDraft,
  start: number,
  source: IntentionContext["source"],
  predecessor: number | null,
): Promise<number> {
  validateContext(draft, start);
  if (draft.promiseId !== null) {
    const promise = await getPromiseById(db, draft.promiseId);
    if (
      !promise ||
      promise.status === "missed" ||
      promise.status === "cancelled"
    )
      throw new Error("Choose an available promise.");
  }
  const result = await db.runAsync(
    `INSERT INTO intention_contexts
    (kind,label,promise_id,planned_until,fresh_until,time_zone,recorded_at,source,predecessor_context_id)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    draft.kind,
    draft.label.trim(),
    draft.promiseId,
    draft.plannedUntil,
    draft.freshUntil,
    draft.timeZone,
    databaseNow(db),
    source,
    predecessor,
  );
  return Number(result.lastInsertRowId);
}
async function replace(
  db: SQLiteDatabase,
  revision: number,
  start: number,
  end: number,
  replacement: { contextId: number; freshUntil: number } | null,
  reason: ContextIntervalVersion["endReason"],
) {
  const timeline = await getTimeline(db);
  const plan = replaceInterval(
    timeline.intervals,
    start,
    end,
    replacement,
    reason,
  );
  for (const row of plan.removed) {
    // Intermediate versions created inside this same atomic command were never externally known.
    if (row.introducedRevision === revision)
      await db.runAsync(
        "DELETE FROM context_interval_versions WHERE id=?",
        row.id,
      );
    else
      await db.runAsync(
        "UPDATE context_interval_versions SET superseded_revision=? WHERE id=?",
        revision,
        row.id,
      );
  }
  for (const row of plan.inserts)
    await db.runAsync(
      `INSERT INTO context_interval_versions
    (context_id,effective_start,effective_end,introduced_revision,end_reason) VALUES (?,?,?,?,?)`,
      row.contextId,
      row.start,
      row.end,
      revision,
      row.endReason,
    );
}
async function activate(
  db: SQLiteDatabase,
  revision: number,
  draft: ContextDraft,
  source: IntentionContext["source"] = "direct",
) {
  const now = databaseNow(db);
  const timeline = await getTimeline(db);
  const previous = contextAt(timeline.intervals, timeline.contexts, now);
  const id = await declare(
    db,
    draft,
    now,
    source,
    previous.context?.id ?? null,
  );
  // Clear all remaining coverage before activation so shortening a context cannot resurrect its predecessor.
  const end = Math.max(
    draft.freshUntil,
    ...timeline.intervals.filter((i) => i.end > now).map((i) => i.end),
  );
  await replace(db, revision, now, end, null, "switched");
  await replace(
    db,
    revision,
    now,
    draft.freshUntil,
    { contextId: id, freshUntil: draft.freshUntil },
    "switched",
  );
  await recordBehaviorEvent(db, {
    type: "context_declared",
    promiseId: draft.promiseId,
    metadata: {
      version: 1,
      contextId: id,
      predecessorContextId: previous.context?.id ?? null,
      effectiveStart: now,
    },
  });
  return id;
}
async function saveAssessment(
  db: SQLiteDatabase,
  reportId: number,
): Promise<number> {
  const report = await getReport(db, reportId);
  if (!report) throw new Error("Report not found.");
  const timeline = await getTimeline(db);
  // Preserve the necessary evidence, not unrelated private context history.
  const relevant = timeline.intervals.filter(
    (i) => i.start < report.end && report.start < i.end,
  );
  const preceding = timeline.intervals
    .filter((i) => i.end <= report.start)
    .sort((a, b) => b.end - a.end)[0];
  if (preceding) relevant.push(preceding);
  const ids = new Set(relevant.map((i) => i.contextId));
  const snapshot = {
    report,
    contexts: timeline.contexts.filter((c) => ids.has(c.id)),
    intervals: relevant,
    reviews: await getReviews(db, reportId),
  };
  const previous = await getLatestAssessment(db, reportId);
  const result = await db.runAsync(
    `INSERT INTO drift_assessments
    (report_id,evaluator_version,context_revision,recorded_at,segments_json,snapshot_json,supersedes_assessment_id)
    VALUES (?,?,?,?,?,?,?)`,
    reportId,
    EVALUATOR_VERSION,
    timeline.revision,
    databaseNow(db),
    JSON.stringify(assess(snapshot)),
    JSON.stringify(snapshot),
    previous?.id ?? null,
  );
  return Number(result.lastInsertRowId);
}
async function correctHistory(
  db: SQLiteDatabase,
  revision: number,
  correction: HistoricalCorrection,
) {
  const { start, end, replacement, continueNow } = correction;
  assertRange(start, end);
  if (end > databaseNow(db))
    throw new Error("Historical changes cannot extend into the future.");
  if (replacement && replacement.freshUntil !== end)
    throw new Error(
      "Historical freshness must match the explicitly reviewed end.",
    );
  const id = replacement
    ? await declare(db, replacement, start, "retrospective", null)
    : null;
  await replace(
    db,
    revision,
    start,
    end,
    id && replacement
      ? { contextId: id, freshUntil: replacement.freshUntil }
      : null,
    "historical_correction",
  );
  let currentId: number | undefined;
  if (continueNow) currentId = await activate(db, revision, continueNow);
  await recordBehaviorEvent(db, {
    type: "context_history_corrected",
    metadata: {
      version: 1,
      effectiveStart: start,
      effectiveEnd: end,
      contextId: id,
      presentContinuationId: currentId ?? null,
    },
  });
  return currentId;
}

/** The application command owns the transaction for every cross-entity action. */
export async function executeCommand(
  db: SQLiteDatabase,
  request: CommandRequest,
  now = Date.now(),
): Promise<CommandResult> {
  assertInstant(now);
  if (!request.commandKey.trim() || request.commandKey.length > 200)
    throw new Error("Invalid command identity.");
  const input = canonical(request);
  return withDatabaseTransaction(
    db,
    async (tx) => {
      const receipt = await tx.getFirstAsync<{
        input_json: string;
        result_json: string;
      }>(
        "SELECT input_json,result_json FROM application_commands WHERE command_key=?",
        request.commandKey,
      );
      if (receipt) {
        if (receipt.input_json !== input)
          throw new Error("Command identity was reused with different input.");
        return JSON.parse(receipt.result_json) as CommandResult;
      }
      const latest = await tx.getFirstAsync<{ recorded_at: number }>(
        "SELECT recorded_at FROM application_commands ORDER BY id DESC LIMIT 1",
      );
      if (latest && now < latest.recorded_at)
        throw new Error(
          "The clock moved backward. Check the device time before saving a new change.",
        );
      const currentRevision = await getContextRevision(tx);
      if (request.expectedContextRevision !== currentRevision)
        throw new Error("Your context changed. Refresh before trying again.");
      const command = request.command;
      const inserted = await tx.runAsync(
        `INSERT INTO application_commands
      (command_key,kind,input_json,recorded_at,affects_context) VALUES (?,?,?,?,?)`,
        request.commandKey,
        command.kind,
        input,
        now,
        changesContext(command) ? 1 : 0,
      );
      const revision = Number(inserted.lastInsertRowId);
      setCommandId(tx, revision);
      const result: CommandResult = { revision };
      const affectedReports = new Set<number>();
      let historical: HistoricalCorrection | undefined;
      switch (command.kind) {
        case "ActivateContext":
        case "ReviseContext":
          if (command.kind === "ReviseContext") {
            const t = await getTimeline(tx);
            if (!contextAt(t.intervals, t.contexts, now).context)
              throw new Error(
                "There is no fresh intention to revise. Start a new one.",
              );
          }
          result.contextId = await activate(tx, revision, command.context);
          break;
        case "EndContext": {
          const timeline = await getTimeline(tx);
          const current = contextAt(timeline.intervals, timeline.contexts, now);
          if (!current.context || !current.interval)
            throw new Error("There is no fresh intention to end.");
          await replace(tx, revision, now, current.interval.end, null, "ended");
          await recordBehaviorEvent(tx, {
            type: "context_ended",
            promiseId: current.context.promiseId,
            metadata: {
              version: 1,
              contextId: current.context.id,
              effectiveEnd: now,
            },
          });
          break;
        }
        case "StartPromiseAndActivateContext":
        case "ResumePromiseContext": {
          const promise = await getPromiseById(tx, command.promiseId);
          if (!promise || ["missed", "cancelled"].includes(promise.status))
            throw new Error("Promise is not available.");
          if (
            command.kind === "ResumePromiseContext" &&
            promise.status === "planned"
          )
            throw new Error("Start this promise first.");
          if (command.context.promiseId !== command.promiseId)
            throw new Error("Context must link to the selected promise.");
          if (promise.status === "planned") await startPromise(tx, promise.id);
          result.contextId = await activate(
            tx,
            revision,
            command.context,
            "promise_start",
          );
          break;
        }
        case "ReachPromiseMinimum":
        case "ReachMinimumAndSwitchContext": {
          const promise = await getPromiseById(tx, command.promiseId);
          if (!promise || ["missed", "cancelled"].includes(promise.status))
            throw new Error("Promise cannot be completed.");
          await markMinimumReached(tx, command.promiseId);
          if (command.kind === "ReachMinimumAndSwitchContext")
            result.contextId = await activate(tx, revision, command.context);
          break;
        }
        case "RecordBehaviorReport": {
          const report = command.report;
          assertRange(report.start, report.end);
          if (report.end > now)
            throw new Error("Reports describe past behavior.");
          if (
            !["consistent", "conflicting", "unclear"].includes(
              report.relation,
            ) ||
            !["intentional", "unintended", "unsure"].includes(
              report.deliberateness,
            )
          )
            throw new Error("Invalid report response.");
          if (report.description.length > 1000)
            throw new Error("Keep the description under 1000 characters.");
          const row = await tx.runAsync(
            `INSERT INTO behavior_reports
          (effective_start,effective_end,recorded_at,source,description,relation,deliberateness,context_id)
          VALUES (?,?,?,'manual',?,?,?,?)`,
            report.start,
            report.end,
            now,
            report.description.trim(),
            report.relation,
            report.deliberateness,
            report.contextId,
          );
          result.reportId = Number(row.lastInsertRowId);
          affectedReports.add(result.reportId);
          await recordBehaviorEvent(tx, {
            type: "behavior_reported",
            metadata: {
              version: 1,
              reportId: result.reportId,
              effectiveStart: report.start,
              effectiveEnd: report.end,
            },
          });
          break;
        }
        case "ReviewAssessment": {
          const review = command.review;
          assertRange(review.start, review.end);
          const assessment = await getAssessment(tx, review.assessmentId);
          if (!assessment) throw new Error("Assessment not found.");
          const report = await getReport(tx, assessment.reportId);
          if (!report || review.start < report.start || review.end > report.end)
            throw new Error("Review must stay within the report interval.");
          if (
            ![
              "intentional",
              "supporting_purpose",
              "plans_changed",
              "unintended",
              "disputed",
              "unsure",
            ].includes(review.response)
          )
            throw new Error("Invalid review response.");
          if (review.explanation.length > 1000)
            throw new Error("Keep the explanation under 1000 characters.");
          if (review.response === "plans_changed" && !command.correction)
            throw new Error("Specify when the plan changed.");
          if (
            command.correction &&
            (command.correction.start !== review.start ||
              command.correction.end !== review.end)
          )
            throw new Error("The correction must match the reviewed interval.");
          if (review.supersedesReviewId !== null) {
            const previous = (await getReviews(tx, report.id)).find(
              (r) => r.id === review.supersedesReviewId,
            );
            if (
              !previous ||
              previous.start !== review.start ||
              previous.end !== review.end
            )
              throw new Error(
                "A replacement review must have the same report and scope.",
              );
          }
          const row = await tx.runAsync(
            `INSERT INTO assessment_reviews
          (assessment_id,report_id,effective_start,effective_end,recorded_at,response,explanation,supersedes_review_id,command_revision)
          VALUES (?,?,?,?,?,?,?,?,?)`,
            assessment.id,
            report.id,
            review.start,
            review.end,
            now,
            review.response,
            review.explanation.trim(),
            review.supersedesReviewId,
            revision,
          );
          result.reviewId = Number(row.lastInsertRowId);
          result.reportId = report.id;
          affectedReports.add(report.id);
          historical = command.correction;
          if (historical)
            result.contextId = await correctHistory(tx, revision, historical);
          if (command.nextContext) {
            if (historical?.continueNow)
              throw new Error("Choose only one present continuation.");
            result.contextId = await activate(
              tx,
              revision,
              command.nextContext,
            );
          }
          await recordBehaviorEvent(tx, {
            type: "assessment_reviewed",
            metadata: {
              version: 1,
              reviewId: result.reviewId,
              assessmentId: assessment.id,
              effectiveStart: review.start,
              effectiveEnd: review.end,
            },
          });
          break;
        }
        case "CorrectHistoricalContext":
          historical = command.correction;
          result.contextId = await correctHistory(tx, revision, historical);
          break;
        default:
          throw new Error("Unknown command.");
      }
      if (historical) {
        const reports = await tx.getAllAsync<{ id: number }>(
          "SELECT id FROM behavior_reports WHERE effective_start < ? AND ? < effective_end",
          historical.end,
          historical.start,
        );
        reports.forEach((r) => affectedReports.add(r.id));
      }
      for (const reportId of affectedReports) {
        const assessmentId = await saveAssessment(tx, reportId);
        if (reportId === result.reportId) result.assessmentId = assessmentId;
      }
      await tx.runAsync(
        "UPDATE application_commands SET result_json=? WHERE id=?",
        JSON.stringify(result),
        revision,
      );
      return result;
    },
    now,
  );
}
