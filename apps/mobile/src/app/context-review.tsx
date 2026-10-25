import { useCallback, useRef, useState } from "react";
import { ScrollView, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import type {
  AssessmentReason,
  ContextKind,
  DriftAssessment,
  ReportedDeliberateness,
  ReportedRelation,
  ReviewResponse,
} from "@alignment/types";
import {
  executeCommand,
  type AlignmentCommand,
  type HistoricalCorrection,
} from "../application/commands";
import {
  getAssessment,
  getContextRevision,
  getReviews,
  listLatestAssessments,
} from "../database/contextRepository";
import { Action, Card, Choices, Field, ui } from "../components/contextUi";
import {
  commandKey,
  minutesFromNow,
  parseTimeInput,
  timeInput,
  timeZone,
} from "../utils/contextTime";

const explanations: Record<AssessmentReason, string> = {
  context_missing: "No applicable intention was known for this period.",
  context_stale: "The earlier declaration was no longer fresh for this period.",
  open_context_no_specific_expectation:
    "You chose flexible time; it does not support an adverse inference.",
  insufficient_temporal_precision:
    "There is not enough detail to interpret this period. You can review a narrower interval.",
  user_reported_consistency: "You reported that this supported your intention.",
  user_reported_possible_conflict:
    "You reported a possible conflict, but its meaning remains uncertain.",
  user_confirmed_unintended_divergence:
    "You explicitly described this divergence as unintended.",
  intentional_change_reported:
    "You described a deliberate change. It is not treated as unwanted drift.",
  supporting_purpose_reported:
    "You explained that this activity served your intention.",
  evidence_disputed:
    "You disputed the evidence. Alignment is not drawing a conclusion from it.",
};
const outcomeLabels = {
  unknown: "Not enough information",
  consistent: "Consistent with your intention",
  possible_drift: "Possible drift",
  confirmed_drift: "Unwanted divergence — confirmed by you",
};
export default function ContextReviewScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [revision, setRevision] = useState<number | null>(null);
  const [assessments, setAssessments] = useState<DriftAssessment[]>([]);
  const [selected, setSelected] = useState<DriftAssessment | null>(null);
  const [original, setOriginal] = useState<DriftAssessment | null>(null);
  const [start, setStart] = useState(() => timeInput(Date.now() - 5 * 60_000));
  const [end, setEnd] = useState(() => timeInput(Date.now() - 1000));
  const [description, setDescription] = useState("");
  const [relation, setRelation] = useState<ReportedRelation>("unclear");
  const [deliberateness, setDeliberateness] =
    useState<ReportedDeliberateness>("unsure");
  const [reviewResponse, setReviewResponse] =
    useState<ReviewResponse>("unsure");
  const [correctionKind, setCorrectionKind] = useState<ContextKind | "unknown">(
    "leisure",
  );
  const [correctionLabel, setCorrectionLabel] = useState("");
  const [continueNow, setContinueNow] = useState<"no" | "yes">("no");
  const [freshMinutes, setFreshMinutes] = useState("60");
  const [historicalOnly, setHistoricalOnly] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    setRevision(await getContextRevision(db));
    setAssessments(await listLatestAssessments(db));
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      void refresh().catch((e) => setError(String(e)));
    }, [refresh]),
  );
  function choose(assessment: DriftAssessment) {
    setSelected(assessment);
    setOriginal(null);
    setHistoricalOnly(false);
    setPreview(false);
    setContinueNow("no");
    setStart(timeInput(assessment.snapshot.report.start));
    setEnd(timeInput(assessment.snapshot.report.end));
    setDescription("");
    setReviewResponse("unsure");
    setMessage("");
    setError("");
  }
  async function save() {
    if (revision === null || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const effectiveStart = parseTimeInput(start);
      const effectiveEnd = parseTimeInput(end);
      const now = Date.now();
      let command: AlignmentCommand;
      const needsCorrection =
        historicalOnly || (selected && reviewResponse === "plans_changed");
      let correction: HistoricalCorrection | undefined;
      if (needsCorrection) {
        if (!preview)
          throw new Error("Preview the affected period before saving.");
        correction = {
          start: effectiveStart,
          end: effectiveEnd,
          replacement:
            correctionKind === "unknown"
              ? null
              : {
                  kind: correctionKind,
                  label: correctionLabel,
                  promiseId: null,
                  plannedUntil: null,
                  freshUntil: effectiveEnd,
                  timeZone: timeZone(),
                },
        };
        if (continueNow === "yes" && correction.replacement)
          correction.continueNow = {
            ...correction.replacement!,
            freshUntil: minutesFromNow(freshMinutes, now),
          };
      }
      if (historicalOnly && correction)
        command = { kind: "CorrectHistoricalContext", correction };
      else if (selected) {
        const reviews = await getReviews(db, selected.reportId);
        const previous = [...reviews]
          .reverse()
          .find((r) => r.start === effectiveStart && r.end === effectiveEnd);
        command = {
          kind: "ReviewAssessment",
          review: {
            assessmentId: selected.id,
            start: effectiveStart,
            end: effectiveEnd,
            response: reviewResponse,
            explanation: description,
            supersedesReviewId: previous?.id ?? null,
          },
          correction,
        };
      } else
        command = {
          kind: "RecordBehaviorReport",
          report: {
            start: effectiveStart,
            end: effectiveEnd,
            description,
            relation,
            deliberateness,
            contextId: null,
          },
        };
      const result = await executeCommand(
        db,
        {
          commandKey: commandKey(),
          expectedContextRevision: revision,
          command,
        },
        now,
      );
      await refresh();
      if (result.assessmentId) {
        const next = await getAssessment(db, result.assessmentId);
        if (next) choose(next);
      } else {
        setHistoricalOnly(false);
        setPreview(false);
      }
      setMessage("Saved. Your original history is preserved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this review.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function earlier() {
    const current = original ?? selected;
    if (current?.supersedesAssessmentId)
      setOriginal(await getAssessment(db, current.supersedesAssessmentId));
  }
  const display = original ?? selected;
  const needsCorrection =
    historicalOnly || (selected && reviewResponse === "plans_changed");
  return (
    <ScrollView contentContainerStyle={ui.page}>
      <Text style={ui.title}>Review what happened</Text>
      <Text style={ui.body}>
        An optional way to check whether Alignment understood a particular
        moment. There is no daily report to complete.
      </Text>
      {assessments.length > 0 && (
        <Card>
          <Text style={ui.heading}>Recent examples</Text>
          {assessments.map((a) => (
            <Action
              key={a.id}
              label={`${new Date(a.snapshot.report.start).toLocaleString()} — ${a.snapshot.report.description || "Reported activity"}`}
              onPress={() => choose(a)}
            />
          ))}
        </Card>
      )}
      {display && (
        <Card>
          <Text style={ui.heading}>
            {original ? "Earlier interpretation" : "Current interpretation"}
          </Text>
          <Text style={ui.muted}>
            Recorded {new Date(display.recordedAt).toLocaleString()}. Based on
            your report, not device monitoring.
          </Text>
          {display.segments.map((segment, i) => {
            const interval = display.snapshot.intervals.find(
              (v) => v.id === segment.intervalVersionId,
            );
            const context = display.snapshot.contexts.find(
              (c) => c.id === interval?.contextId,
            );
            return (
              <Card key={i}>
                <Text style={ui.muted}>
                  {new Date(segment.start).toLocaleString()} –{" "}
                  {new Date(segment.end).toLocaleString()}
                </Text>
                <Text style={ui.body}>{outcomeLabels[segment.outcome]}</Text>
                <Text style={ui.muted}>
                  Intention:{" "}
                  {context ? context.label || context.kind : "Unknown"}
                  {context
                    ? ` (recorded ${new Date(context.recordedAt).toLocaleString()})`
                    : ""}
                </Text>
                {segment.reasons.map((reason) => (
                  <Text style={ui.body} key={reason}>
                    {explanations[reason]}
                  </Text>
                ))}
              </Card>
            );
          })}
          {!!display.supersedesAssessmentId && (
            <Action
              label="See the preceding interpretation"
              onPress={() => {
                void earlier().catch((e) => setError(String(e)));
              }}
            />
          )}
          {original && (
            <Action
              label="Return to the current interpretation"
              onPress={() => setOriginal(null)}
            />
          )}
        </Card>
      )}
      <Action
        label="Report a different example"
        onPress={() => {
          setSelected(null);
          setOriginal(null);
          setHistoricalOnly(false);
          setDescription("");
          setPreview(false);
        }}
      />
      <Action
        label="Correct a past intention"
        onPress={() => {
          setHistoricalOnly(true);
          setSelected(null);
          setOriginal(null);
          setPreview(false);
        }}
      />
      <Text style={ui.heading}>
        {historicalOnly
          ? "Correct the context for this period"
          : selected
            ? "Review this interpretation"
            : "A lightweight example"}
      </Text>
      <Text style={ui.muted}>
        Times include their UTC offset so changes around midnight or daylight
        saving are unambiguous. You can narrow the period.
      </Text>
      <Field
        label="Applies from (date, time, and offset)"
        value={start}
        onChange={(v) => {
          setStart(v);
          setPreview(false);
        }}
      />
      <Field
        label="Applies until (date, time, and offset)"
        value={end}
        onChange={(v) => {
          setEnd(v);
          setPreview(false);
        }}
      />
      {selected && !historicalOnly ? (
        <Choices
          value={reviewResponse}
          onChange={(v) => {
            setReviewResponse(v);
            setPreview(false);
          }}
          options={[
            { value: "intentional", label: "This was intentional" },
            {
              value: "supporting_purpose",
              label: "I needed this activity/app",
            },
            { value: "plans_changed", label: "Plans had changed" },
            { value: "unintended", label: "I got pulled away" },
            { value: "disputed", label: "The report is wrong" },
            { value: "unsure", label: "I’m not sure" },
          ]}
        />
      ) : (
        !historicalOnly && (
          <>
            <Text style={ui.label}>How did it relate to your intention?</Text>
            <Choices
              value={relation}
              onChange={setRelation}
              options={[
                { value: "consistent", label: "Supported it" },
                { value: "conflicting", label: "May have conflicted" },
                { value: "unclear", label: "Unclear" },
              ]}
            />
            <Text style={ui.label}>Was that choice deliberate?</Text>
            <Choices
              value={deliberateness}
              onChange={setDeliberateness}
              options={[
                { value: "intentional", label: "Intentional" },
                { value: "unintended", label: "Unintended" },
                { value: "unsure", label: "Not sure" },
              ]}
            />
          </>
        )
      )}
      <Field
        label={
          selected ? "Explanation (optional)" : "Brief description (optional)"
        }
        value={description}
        onChange={setDescription}
        multiline
      />
      {needsCorrection && (
        <Card>
          <Text style={ui.heading}>What had you chosen for that period?</Text>
          <Choices
            value={correctionKind}
            onChange={(v) => {
              setCorrectionKind(v);
              if (v === "unknown") setContinueNow("no");
              setPreview(false);
            }}
            options={[
              { value: "activity", label: "Activity" },
              { value: "leisure", label: "Leisure" },
              { value: "open", label: "Open time" },
              { value: "unknown", label: "I don’t know" },
            ]}
          />
          {correctionKind !== "unknown" && (
            <Field
              label="Past intention"
              value={correctionLabel}
              onChange={(v) => {
                setCorrectionLabel(v);
                setPreview(false);
              }}
            />
          )}
          {correctionKind !== "unknown" && (
            <>
              <Text style={ui.label}>
                Does this also describe your intention now?
              </Text>
              <Choices
                value={continueNow}
                onChange={(v) => {
                  setContinueNow(v);
                  setPreview(false);
                }}
                options={[
                  { value: "no", label: "Past period only" },
                  { value: "yes", label: "Also choose it now" },
                ]}
              />
            </>
          )}
          {continueNow === "yes" && (
            <Field
              label="Check whether this is still current in minutes"
              value={freshMinutes}
              onChange={(v) => {
                setFreshMinutes(v);
                setPreview(false);
              }}
            />
          )}
          <Action
            label="Preview affected period"
            onPress={() => {
              try {
                const a = parseTimeInput(start);
                const b = parseTimeInput(end);
                if (a >= b || b > Date.now())
                  throw new Error(
                    "Choose a past interval with its end after its start.",
                  );
                setPreview(true);
                setError("");
              } catch (e) {
                setError(String(e));
              }
            }}
          />
          {preview && (
            <Text style={ui.body}>
              Replace the context from{" "}
              {new Date(parseTimeInput(start)).toLocaleString()} until{" "}
              {new Date(parseTimeInput(end)).toLocaleString()} with{" "}
              {correctionKind === "unknown"
                ? "unknown intention"
                : correctionLabel || correctionKind}
              . Outside that period, existing history stays as recorded. This
              correction is recorded when you save.
              {continueNow === "yes"
                ? " A separate current intention will also start now."
                : " Your present intention will not be changed."}
            </Text>
          )}
        </Card>
      )}
      {!!message && <Text style={ui.body}>{message}</Text>}
      {!!error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      )}
      <Action
        label={
          busy
            ? "Saving…"
            : selected || historicalOnly
              ? "Save review"
              : "Check this example"
        }
        disabled={busy || revision === null}
        onPress={() => {
          void save();
        }}
      />
      <Action label="Dismiss and return" onPress={() => router.back()} />
    </ScrollView>
  );
}
