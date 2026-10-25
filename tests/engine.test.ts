import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assess,
  assertNoOverlap,
  contextAt,
  replaceInterval,
  validateContext,
} from "@alignment/engine";
import type {
  AssessmentReview,
  AssessmentSnapshot,
  ContextIntervalVersion,
  IntentionContext,
} from "@alignment/types";
import { T, M, draft } from "./persistenceContract";
import { parseTimeInput } from "../apps/mobile/src/utils/contextTime";
function snapshot(
  kind: IntentionContext["kind"] = "activity",
): AssessmentSnapshot {
  return {
    report: {
      id: 1,
      start: T + M,
      end: T + 2 * M,
      recordedAt: T + 3 * M,
      source: "manual",
      description: "",
      relation: "unclear",
      deliberateness: "unsure",
      contextId: null,
    },
    contexts: [
      {
        ...draft(kind),
        id: 1,
        recordedAt: T,
        source: "direct",
        predecessorContextId: null,
      },
    ],
    intervals: [
      {
        id: 1,
        contextId: 1,
        start: T,
        end: T + 90 * M,
        introducedRevision: 1,
        supersededRevision: null,
        endReason: "freshness",
      },
    ],
    reviews: [],
  };
}
for (const [relation, choice, expected] of [
  ["consistent", "intentional", "consistent"],
  ["conflicting", "unsure", "possible_drift"],
  ["conflicting", "unintended", "confirmed_drift"],
  ["conflicting", "intentional", "unknown"],
  ["unclear", "unsure", "unknown"],
] as const)
  test(`assessment: ${relation}/${choice} yields ${expected}`, () => {
    const s = snapshot();
    s.report.relation = relation;
    s.report.deliberateness = choice;
    assert.equal(assess(s)[0].outcome, expected);
    assert.ok(assess(s)[0].reasons.length);
  });
for (const [response, outcome] of [
  ["intentional", "unknown"],
  ["supporting_purpose", "consistent"],
  ["plans_changed", "unknown"],
  ["unintended", "confirmed_drift"],
  ["disputed", "unknown"],
  ["unsure", "unknown"],
] as const)
  test(`review: ${response} yields ${outcome}`, () => {
    const s = snapshot();
    s.reviews = [
      {
        id: 1,
        reportId: 1,
        assessmentId: 1,
        start: s.report.start,
        end: s.report.end,
        recordedAt: T + 4 * M,
        commandRevision: 2,
        response,
        explanation: "",
        supersedesReviewId: null,
      },
    ];
    assert.equal(assess(s)[0].outcome, outcome);
    assert.equal(assess(s)[0].basis, "user_review");
  });
test("missing context is unknown; explicit retrospective acknowledgement is attributed to the user", () => {
  const s = snapshot();
  s.contexts = [];
  s.intervals = [];
  assert.equal(assess(s)[0].reasons[0], "context_missing");
  s.report.relation = "conflicting";
  s.report.deliberateness = "unintended";
  assert.equal(assess(s)[0].outcome, "confirmed_drift");
  assert.equal(assess(s)[0].basis, "user_report");
});
test("freshness boundary is exclusive and planned end is not freshness", () => {
  const s = snapshot();
  assert.equal(contextAt(s.intervals, s.contexts, T + 90 * M).context, null);
  assert.equal(contextAt(s.intervals, s.contexts, T + 31 * M).context?.id, 1);
  s.report.start = T + 90 * M;
  s.report.end = T + 91 * M;
  assert.equal(assess(s)[0].reasons[0], "context_stale");
});
test("open context prevents adverse inference without explicit unintended acknowledgement", () => {
  const s = snapshot("open");
  s.report.relation = "conflicting";
  for (let i = 0; i < 5; i++) assert.equal(assess(s)[0].outcome, "unknown");
  s.report.deliberateness = "unintended";
  assert.equal(assess(s)[0].outcome, "confirmed_drift");
});
test("a broad subjective report is not distributed across different intentions", () => {
  const s = snapshot();
  s.intervals[0].end = T + M + 30000;
  s.contexts.push({ ...s.contexts[0], id: 2, kind: "leisure" });
  s.intervals.push({
    ...s.intervals[0],
    id: 2,
    contextId: 2,
    start: T + M + 30000,
    end: T + 90 * M,
  });
  s.report.relation = "conflicting";
  s.report.deliberateness = "unintended";
  assert.deepEqual(
    assess(s).map((x) => x.outcome),
    ["unknown", "unknown"],
  );
  assert.ok(
    assess(s).every((x) =>
      x.reasons.includes("insufficient_temporal_precision"),
    ),
  );
});
test("an old context reference does not override applicable timeline", () => {
  const s = snapshot();
  s.report.contextId = 99;
  s.report.relation = "conflicting";
  s.report.deliberateness = "unintended";
  assert.equal(assess(s)[0].outcome, "unknown");
});
test("new scoped review wins only in its own interval", () => {
  const s = snapshot();
  const review: AssessmentReview = {
    id: 1,
    assessmentId: 1,
    reportId: 1,
    start: s.report.start,
    end: s.report.end,
    recordedAt: T + 4 * M,
    commandRevision: 2,
    response: "unintended",
    explanation: "",
    supersedesReviewId: null,
  };
  s.reviews = [
    review,
    {
      ...review,
      id: 2,
      start: T + M + 30000,
      commandRevision: 3,
      response: "disputed",
    },
  ];
  assert.deepEqual(
    assess(s).map((x) => x.outcome),
    ["confirmed_drift", "unknown"],
  );
});
test("interval replacement retains exact unaffected prefixes and suffixes", () => {
  const original = snapshot().intervals;
  const plan = replaceInterval(
    original,
    T + 10 * M,
    T + 20 * M,
    { contextId: 2, freshUntil: T + 20 * M },
    "historical_correction",
  );
  assert.deepEqual(plan.removed, original);
  assert.deepEqual(
    plan.inserts.map((x) => [x.start, x.end]),
    [
      [T, T + 10 * M],
      [T + 20 * M, T + 90 * M],
      [T + 10 * M, T + 20 * M],
    ],
  );
  assertNoOverlap(plan.inserts);
});
test("range, overlap, clock, and declaration validation rejects invalid inputs", () => {
  assert.throws(() => validateContext(draft("activity", T), T));
  assert.throws(() => validateContext({ ...draft(), label: " " }, T));
  assert.throws(() => validateContext({ ...draft("open"), promiseId: 1 }, T));
  assert.throws(() =>
    validateContext({ ...draft(), timeZone: "Not/AZone" }, T),
  );
  assert.throws(() => contextAt([], [], NaN));
  assert.throws(() =>
    replaceInterval([], T, T + M, { contextId: 1, freshUntil: T }, "ended"),
  );
  assert.throws(() =>
    assertNoOverlap([
      { start: T, end: T + M },
      { start: T + 1, end: T + 2 * M },
    ]),
  );
});
test("offset input distinguishes repeated daylight-saving times and rejects invalid dates", () => {
  assert.equal(
    parseTimeInput("2026-11-01T01:30:00-05:00") -
      parseTimeInput("2026-11-01T01:30:00-04:00"),
    60 * M,
  );
  assert.throws(() => parseTimeInput("2026-02-30T10:00:00Z"));
  assert.throws(() => parseTimeInput("2026-11-01T01:30:00"));
});
test("an explicitly ended context is missing rather than merely stale", () => {
  const s = snapshot();
  s.intervals[0].end = T + M;
  s.intervals[0].endReason = "ended";
  assert.equal(assess(s)[0].reasons[0], "context_missing");
});
