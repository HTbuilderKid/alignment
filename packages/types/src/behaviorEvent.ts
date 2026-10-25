export type BehaviorEventType =
  | "context_declared"
  | "context_ended"
  | "context_history_corrected"
  | "behavior_reported"
  | "assessment_reviewed"
  | "promise_created"
  | "promise_started"
  | "minimum_reached"
  | "target_reached"
  | "promise_missed"
  | "promise_cancelled"
  | "promise_rescheduled"
  | "promise_minimum_reduced";

export type BehaviorEvent = {
  id: number;

  type: BehaviorEventType;

  promiseId: number | null;
  directionItemId: number | null;

  metadata: Record<string, unknown>;

  occurredAt: string;
  recordedAt: string | null;
  commandId: number | null;
};