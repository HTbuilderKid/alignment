import type { SQLiteDatabase } from "expo-sqlite";
import type {
  AssessmentReview,
  BehaviorReport,
  ContextIntervalVersion,
  ContextState,
  DriftAssessment,
  IntentionContext,
} from "@alignment/types";
import { contextAt, intervalsAtRevision } from "@alignment/engine";
import { coordinated } from "./coordinator";

const contextColumns = `id, kind, label, promise_id AS promiseId, planned_until AS plannedUntil,
 fresh_until AS freshUntil, time_zone AS timeZone, recorded_at AS recordedAt, source,
 predecessor_context_id AS predecessorContextId`;
const intervalColumns = `id, context_id AS contextId, effective_start AS start, effective_end AS end,
 introduced_revision AS introducedRevision, superseded_revision AS supersededRevision, end_reason AS endReason`;
export const getTimeline = coordinated(
  async (db: SQLiteDatabase, revision?: number) => {
    const contexts = await db.getAllAsync<IntentionContext>(
      `SELECT ${contextColumns} FROM intention_contexts`,
    );
    const versions = await db.getAllAsync<ContextIntervalVersion>(
      `SELECT ${intervalColumns} FROM context_interval_versions`,
    );
    const latest = await getContextRevision(db);
    return {
      contexts,
      intervals: intervalsAtRevision(versions, revision ?? latest),
      revision: revision ?? latest,
    };
  },
);
export const getContextRevision = coordinated(
  async (db: SQLiteDatabase): Promise<number> => {
    const row = await db.getFirstAsync<{ revision: number }>(
      "SELECT COALESCE(MAX(id),0) AS revision FROM application_commands WHERE affects_context=1",
    );
    return row!.revision;
  },
);
export const getContextState = coordinated(
  async (db: SQLiteDatabase, now: number): Promise<ContextState> => {
    const timeline = await getTimeline(db);
    return {
      ...contextAt(timeline.intervals, timeline.contexts, now),
      revision: timeline.revision,
      mostRecentContext:
        timeline.contexts.sort((a, b) => b.id - a.id)[0] ?? null,
    };
  },
);
export const getReport = coordinated(
  async (db: SQLiteDatabase, id: number): Promise<BehaviorReport | null> =>
    db.getFirstAsync<BehaviorReport>(
      `SELECT id, effective_start AS start, effective_end AS end,
   recorded_at AS recordedAt, source, description, relation, deliberateness, context_id AS contextId
   FROM behavior_reports WHERE id=?`,
      id,
    ),
);
export const getReviews = coordinated(
  async (db: SQLiteDatabase, reportId: number): Promise<AssessmentReview[]> =>
    db.getAllAsync<AssessmentReview>(
      `SELECT id, assessment_id AS assessmentId, report_id AS reportId,
   effective_start AS start, effective_end AS end, recorded_at AS recordedAt, response, explanation,
   supersedes_review_id AS supersedesReviewId, command_revision AS commandRevision
   FROM assessment_reviews WHERE report_id=? ORDER BY command_revision,id`,
      reportId,
    ),
);
type AssessmentRow = Omit<DriftAssessment, "segments" | "snapshot"> & {
  segmentsJson: string;
  snapshotJson: string;
};
const assessmentColumns = `id, report_id AS reportId, evaluator_version AS evaluatorVersion,
 context_revision AS contextRevision, recorded_at AS recordedAt, segments_json AS segmentsJson,
 snapshot_json AS snapshotJson, supersedes_assessment_id AS supersedesAssessmentId`;
function decodeAssessment(row: AssessmentRow): DriftAssessment {
  const { segmentsJson, snapshotJson, ...rest } = row;
  const segments = JSON.parse(segmentsJson);
  const snapshot = JSON.parse(snapshotJson);
  if (
    !Array.isArray(segments) ||
    !snapshot?.report ||
    !Array.isArray(snapshot.intervals)
  ) {
    throw new Error(
      "Assessment history is unreadable. No interpretation was inferred.",
    );
  }
  return { ...rest, segments, snapshot };
}
export const getAssessment = coordinated(
  async (db: SQLiteDatabase, id: number): Promise<DriftAssessment | null> => {
    const row = await db.getFirstAsync<AssessmentRow>(
      `SELECT ${assessmentColumns} FROM drift_assessments WHERE id=?`,
      id,
    );
    return row ? decodeAssessment(row) : null;
  },
);
export const getLatestAssessment = coordinated(
  async (
    db: SQLiteDatabase,
    reportId: number,
  ): Promise<DriftAssessment | null> => {
    const row = await db.getFirstAsync<AssessmentRow>(
      `SELECT ${assessmentColumns} FROM drift_assessments WHERE report_id=? ORDER BY id DESC LIMIT 1`,
      reportId,
    );
    return row ? decodeAssessment(row) : null;
  },
);
export const listLatestAssessments = coordinated(
  async (db: SQLiteDatabase): Promise<DriftAssessment[]> => {
    const rows =
      await db.getAllAsync<AssessmentRow>(`SELECT ${assessmentColumns} FROM drift_assessments
    WHERE id IN (SELECT MAX(id) FROM drift_assessments GROUP BY report_id) ORDER BY id DESC LIMIT 20`);
    return rows.map(decodeAssessment);
  },
);
