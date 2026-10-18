export type PromiseStatus =
  | "planned"
  | "active"
  | "kept"
  | "missed"
  | "cancelled";

export type PromiseMeasureKind =
  | "duration"
  | "count"
  | "action";

export type PromiseFailureReason =
  | "too_ambitious"
  | "forgot"
  | "plans_changed"
  | "avoided"
  | "unexpected_event"
  | "chose_something_else"
  | "other";

export type PromiseMeasure = {
  kind: PromiseMeasureKind;
  description: string;
  amount: number | null;
  unit: string | null;
};

export type AlignmentPromise = {
  id: number;

  directionItemId: number | null;

  title: string;
  why: string | null;

  target: PromiseMeasure;
  minimum: PromiseMeasure;

  scheduledDate: string;
  scheduledTime: string | null;

  status: PromiseStatus;

  startedAt: string | null;
  minimumReachedAt: string | null;
  targetReachedAt: string | null;
  missedAt: string | null;
  cancelledAt: string | null;

  failureReason: PromiseFailureReason | null;
  failureNote: string | null;

  createdAt: string;
  updatedAt: string;
};

export type CreatePromiseInput = {
  directionItemId: number | null;

  title: string;
  why?: string | null;

  target: PromiseMeasure;
  minimum: PromiseMeasure;

  scheduledDate: string;
  scheduledTime?: string | null;
};