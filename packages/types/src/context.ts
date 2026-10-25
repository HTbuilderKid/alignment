/** UTC milliseconds. Effective time and recording time are separate facts. */
export type Instant = number;
export type ContextKind = "activity" | "leisure" | "open";
export type ContextDeclarationSource =
  | "direct"
  | "promise_start"
  | "retrospective";
export type AssessmentOutcome =
  | "unknown"
  | "consistent"
  | "possible_drift"
  | "confirmed_drift";
export type ReportedRelation = "consistent" | "conflicting" | "unclear";
export type ReportedDeliberateness = "intentional" | "unintended" | "unsure";
export type AssessmentBasis =
  | "user_report"
  | "user_review"
  | "deterministic_rule";
export type ReviewResponse =
  | "intentional"
  | "supporting_purpose"
  | "plans_changed"
  | "unintended"
  | "disputed"
  | "unsure";
export type AssessmentReason =
  | "context_missing"
  | "context_stale"
  | "open_context_no_specific_expectation"
  | "insufficient_temporal_precision"
  | "user_reported_consistency"
  | "user_reported_possible_conflict"
  | "user_confirmed_unintended_divergence"
  | "intentional_change_reported"
  | "supporting_purpose_reported"
  | "evidence_disputed";

export type ContextDraft = {
  kind: ContextKind;
  label: string;
  promiseId: number | null;
  plannedUntil: Instant | null;
  freshUntil: Instant;
  /** IANA zone used when the user entered local times. */
  timeZone: string;
};
export type IntentionContext = ContextDraft & {
  id: number;
  recordedAt: Instant;
  source: ContextDeclarationSource;
  predecessorContextId: number | null;
};
export type ContextIntervalVersion = {
  id: number;
  contextId: number;
  start: Instant;
  end: Instant;
  introducedRevision: number;
  supersededRevision: number | null;
  endReason: "freshness" | "switched" | "ended" | "historical_correction";
};
export type BehaviorReportInput = {
  start: Instant;
  end: Instant;
  description: string;
  relation: ReportedRelation;
  deliberateness: ReportedDeliberateness;
  contextId: number | null;
};
export type BehaviorReport = BehaviorReportInput & {
  id: number;
  recordedAt: Instant;
  source: "manual";
};
export type AssessmentReviewInput = {
  assessmentId: number;
  start: Instant;
  end: Instant;
  response: ReviewResponse;
  explanation: string;
  supersedesReviewId: number | null;
};
export type AssessmentReview = AssessmentReviewInput & {
  id: number;
  reportId: number;
  recordedAt: Instant;
  commandRevision: number;
};
export type AssessmentSegment = {
  start: Instant;
  end: Instant;
  intervalVersionId: number | null;
  outcome: AssessmentOutcome;
  basis: AssessmentBasis;
  reasons: AssessmentReason[];
  limitations: string[];
};
export type AssessmentSnapshot = {
  report: BehaviorReport;
  contexts: IntentionContext[];
  intervals: ContextIntervalVersion[];
  reviews: AssessmentReview[];
};
export type DriftAssessment = {
  id: number;
  reportId: number;
  evaluatorVersion: string;
  contextRevision: number;
  recordedAt: Instant;
  segments: AssessmentSegment[];
  snapshot: AssessmentSnapshot;
  supersedesAssessmentId: number | null;
};
export type ContextState = {
  revision: number;
  context: IntentionContext | null;
  interval: ContextIntervalVersion | null;
  mostRecentContext: IntentionContext | null;
};
