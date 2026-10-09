export type DirectionKind =
  | "toward"
  | "reduce";

export type DirectionStatus =
  | "active"
  | "paused"
  | "completed"
  | "removed";

export type UserDirection = {
  id: number;
  statement: string;

  modelConfirmedAt: string | null;

  createdAt: string;
  updatedAt: string;
};

export type DirectionItem = {
  id: number;

  userDirectionId: number;

  kind: DirectionKind;

  title: string;
  description: string | null;

  status: DirectionStatus;

  sortOrder: number;

  createdAt: string;
  updatedAt: string;
};

export type DirectionDraft = {
  kind: DirectionKind;
  title: string;
  description?: string | null;
};

export type DirectionModel = {
  direction: UserDirection;
  items: DirectionItem[];
};