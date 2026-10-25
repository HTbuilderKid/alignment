import type {
  AssessmentSegment,
  AssessmentSnapshot,
  ContextDraft,
  ContextIntervalVersion,
  IntentionContext,
  Instant,
} from "@alignment/types";

export const EVALUATOR_VERSION = "step6/1";
export function assertInstant(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) {
    throw new Error("Invalid UTC instant.");
  }
}
export function assertRange(start: Instant, end: Instant): void {
  assertInstant(start);
  assertInstant(end);
  if (start >= end)
    throw new Error("The interval must have a positive duration.");
}
export function validateContext(draft: ContextDraft, start: Instant): void {
  assertRange(start, draft.freshUntil);
  if (!["activity", "leisure", "open"].includes(draft.kind))
    throw new Error("Invalid context kind.");
  if (draft.kind === "activity" && !draft.label.trim())
    throw new Error("Describe the activity.");
  if (draft.label.length > 500)
    throw new Error("Keep the activity description under 500 characters.");
  if (draft.kind !== "activity" && draft.promiseId !== null)
    throw new Error("Only an activity can link to a promise.");
  if (draft.plannedUntil !== null) assertRange(start, draft.plannedUntil);
  try {
    new Intl.DateTimeFormat("en", { timeZone: draft.timeZone });
  } catch {
    throw new Error("Choose a valid time zone.");
  }
}
export function intervalsAtRevision(
  intervals: ContextIntervalVersion[],
  revision: number,
): ContextIntervalVersion[] {
  return intervals.filter(
    (i) =>
      i.introducedRevision <= revision &&
      (i.supersededRevision === null || i.supersededRevision > revision),
  );
}
export function assertNoOverlap(
  intervals: Pick<ContextIntervalVersion, "start" | "end">[],
): void {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  sorted.forEach((i, index) => {
    assertRange(i.start, i.end);
    if (index && sorted[index - 1].end > i.start)
      throw new Error("Context intervals overlap.");
  });
}
export function contextAt(
  intervals: ContextIntervalVersion[],
  contexts: IntentionContext[],
  now: Instant,
) {
  assertInstant(now);
  assertNoOverlap(intervals);
  const interval = intervals.find((i) => i.start <= now && now < i.end) ?? null;
  const context = contexts.find((c) => c.id === interval?.contextId) ?? null;
  return context && now < context.freshUntil
    ? { interval, context }
    : { interval: null, context: null };
}
/** Pure replacement plan. The persistence layer assigns IDs/revisions atomically. */
export function replaceInterval(
  current: ContextIntervalVersion[],
  start: Instant,
  end: Instant,
  replacement: { contextId: number; freshUntil: Instant } | null,
  reason: ContextIntervalVersion["endReason"],
) {
  assertRange(start, end);
  assertNoOverlap(current);
  if (replacement && end > replacement.freshUntil)
    throw new Error("Coverage exceeds freshness.");
  const removed = current.filter((i) => i.start < end && start < i.end);
  const inserts: Pick<
    ContextIntervalVersion,
    "contextId" | "start" | "end" | "endReason"
  >[] = [];
  for (const i of removed) {
    if (i.start < start)
      inserts.push({
        contextId: i.contextId,
        start: i.start,
        end: start,
        endReason: reason,
      });
    if (i.end > end)
      inserts.push({
        contextId: i.contextId,
        start: end,
        end: i.end,
        endReason: i.endReason,
      });
  }
  if (replacement)
    inserts.push({
      contextId: replacement.contextId,
      start,
      end,
      endReason: "freshness",
    });
  assertNoOverlap([...current.filter((i) => !removed.includes(i)), ...inserts]);
  return { removed, inserts };
}

export function assess(snapshot: AssessmentSnapshot): AssessmentSegment[] {
  const { report, intervals, contexts, reviews } = snapshot;
  assertRange(report.start, report.end);
  assertNoOverlap(intervals);
  const boundaries = new Set([report.start, report.end]);
  for (const item of [...intervals, ...reviews]) {
    for (const t of [item.start, item.end])
      if (t > report.start && t < report.end) boundaries.add(t);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  // A single broad report cannot assign its subjective meaning to several contexts.
  const reportContexts = new Set(
    points
      .slice(0, -1)
      .map((t) => contextAt(intervals, contexts, t).context?.id ?? null),
  );
  return points.slice(0, -1).map((start, index): AssessmentSegment => {
    const end = points[index + 1];
    const { context, interval } = contextAt(intervals, contexts, start);
    const result: AssessmentSegment = {
      start,
      end,
      intervalVersionId: interval?.id ?? null,
      outcome: "unknown",
      basis: "deterministic_rule",
      reasons: [],
      limitations: ["Manual report; behavior was not independently observed."],
    };
    const review = reviews
      .filter((r) => r.start <= start && r.end >= end)
      .sort((a, b) => b.commandRevision - a.commandRevision || b.id - a.id)[0];
    if (review) {
      result.basis = "user_review";
      switch (review.response) {
        case "unintended":
          result.outcome = "confirmed_drift";
          result.reasons = ["user_confirmed_unintended_divergence"];
          break;
        case "supporting_purpose":
          result.outcome = "consistent";
          result.reasons = ["supporting_purpose_reported"];
          break;
        case "intentional":
          result.reasons = ["intentional_change_reported"];
          break;
        case "plans_changed":
          // The correction changes the applicable context; it does not claim behavior matched it.
          result.reasons = ["intentional_change_reported"];
          break;
        case "disputed":
          result.reasons = ["evidence_disputed"];
          break;
        case "unsure":
          result.reasons = ["insufficient_temporal_precision"];
          break;
      }
      return result;
    }
    if (
      reportContexts.size > 1 ||
      (report.contextId !== null && report.contextId !== context?.id)
    ) {
      result.reasons = ["insufficient_temporal_precision"];
      result.limitations.push(
        "Review a narrower interval to clarify its meaning.",
      );
      return result;
    }
    // An explicit retrospective acknowledgement is permitted even during open/unknown time.
    if (
      report.relation === "conflicting" &&
      report.deliberateness === "unintended"
    ) {
      result.outcome = "confirmed_drift";
      result.basis = "user_report";
      result.reasons = ["user_confirmed_unintended_divergence"];
      return result;
    }
    if (!context) {
      const preceding = intervals
        .filter((i) => i.end <= start)
        .sort((a, b) => b.end - a.end)[0];
      result.reasons = [
        preceding?.endReason === "freshness"
          ? "context_stale"
          : "context_missing",
      ];
      return result;
    }
    if (report.relation === "consistent") {
      result.outcome = "consistent";
      result.basis = "user_report";
      result.reasons = ["user_reported_consistency"];
    } else if (report.deliberateness === "intentional") {
      result.basis = "user_report";
      result.reasons = ["intentional_change_reported"];
    } else if (context.kind === "open") {
      result.reasons = ["open_context_no_specific_expectation"];
    } else if (report.relation === "conflicting") {
      result.outcome = "possible_drift";
      result.basis = "user_report";
      result.reasons = ["user_reported_possible_conflict"];
    } else {
      result.reasons = ["insufficient_temporal_precision"];
    }
    return result;
  });
}
