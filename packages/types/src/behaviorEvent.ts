export type BehaviorEventType =
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
};