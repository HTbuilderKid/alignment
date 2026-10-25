# Step 6: Context and drift foundation

Step 6 separates a Promise obligation from the user's present intention. A kept minimum never ends a context or makes the target obligatory. Activity, leisure, and open time are equally legitimate declarations. Unregistered time is unknown, not drift.

## Using the feature

Today and Promise detail show the current intention. Choose an activity (optionally linked to a Promise), leisure, or open time. An expected duration is optional. The freshness checkpoint says when Alignment must stop assuming the declaration still describes the present; it is not a permission limit. The initial suggestion is 60 minutes and is editable.

Starting a Promise opens the intention form. The start and declaration save together. An already-started or kept Promise can be selected again without another `promise_started` event. Reaching the minimum leaves the intention untouched. “Minimum reached — switch to leisure” commits fulfillment and the switch together.

“Review what happened” is an optional validation path, not a daily journal. Enter a bounded report, inspect its explanation, and optionally correct it. “Plans had changed” previews a retrospective replacement. It records both when the replacement applies and when Alignment learned it. The present changes only if the user explicitly selects present continuation. Unknown context can also replace a past interval.

## Domain and persistence

- `packages/types/src/context.ts`: declarations, interval versions, reports, assessments, reviews.
- `packages/alignment-engine/src/index.ts`: pure validity, interval-replacement, segmentation, and assessment rules. It receives time and evidence; it has no React, SQLite, network, or Android dependency.
- `apps/mobile/src/application/commands.ts`: atomic compound operations and idempotency receipts.
- `apps/mobile/src/database/coordinator.ts`: serialized access to the shared SQLite connection. Repositories receive a transaction-scoped handle and join the caller's transaction. Never issue application SQL directly on the raw provider connection or retain a transaction handle after its callback.
- `apps/mobile/src/database/contextRepository.ts`: context and interpretation reads.
- `apps/mobile/src/database/migrationV4.ts`: additive v4 schema and integrity guards.

Effective intervals are half-open `[start, end)`. New domain times are UTC milliseconds; declarations retain the input timezone. Existing event timestamps remain ISO strings. Recording time is independent of effective time. The command ID is an ordered knowledge revision.

Declarations and assessment runs are immutable. An interval version may only acquire its superseding revision; its original bounds remain unchanged. Historical replacement splits intersecting intervals, preserving unaffected prefixes and suffixes. SQL triggers reject overlaps in the current version set. Historical queries select the versions visible at a specified revision. Intermediate versions created and replaced within a single uncommitted command are discarded because they were never externally visible.

Each command checks the expected context revision, captures one recording time, and commits its entity changes, events, assessments, and receipt in one transaction. Retrying the same command identity and input returns the committed result. Reusing the identity with different input fails. A backward clock jump rejects new writes instead of interpreting them as historical changes.

Assessment snapshots retain only relevant context and evidence. A new review or historical correction appends replacement assessments without editing prior results. Partial reviews affect only their bounded scope. A report spanning different intentions remains uncertain unless a scoped review clarifies it.

The v1 evaluator outcomes are `unknown`, `consistent`, `possible_drift`, and `confirmed_drift`. Confirmation is always explicitly user supplied. Open time suppresses inferred adversity but permits retrospective self-reported unwanted behavior. There is no numerical confidence, automatic escalation, app classification, or AI behavior interpretation.

Events added: `context_declared`, `context_ended`, `context_history_corrected`, `behavior_reported`, and `assessment_reviewed`. Assessment rows provide assessment history without duplicating every result as an event. Legacy event recording times remain null. Migration v3 now writes literal version 3; v4 writes version 4 only within its successfully completed transaction. Existing promises never produce inferred contexts during migration.

## Validation

Use Node 24 (the Node test adapter uses built-in SQLite).

```sh
npm ci
npm run lint
npm test
npm run typecheck
```

The Node suite uses real SQLite for migrations, trigger constraints, transactions, rollback, idempotency, and historical queries. It also exercises pure assessment and temporal rules.

For Expo SQLite web and the UI smoke test, start Metro in one terminal:

```sh
EXPO_OFFLINE=1 npm run web --workspace=mobile -- --port 8082
```

Then run:

```sh
npx playwright install chromium
npm run test:web
```

The runner uses `/usr/bin/chromium` when present; otherwise it uses Playwright's installed browser. Override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if needed, or `ALIGNMENT_TEST_URL` for another Metro URL. Restart Metro after adding the test entry if it was started with `CI=1` (file watching is disabled in that mode).

The browser runner uses fresh browser storage and uniquely named disposable test databases. Its custom HTML route exists only inside Playwright. `apps/mobile/tests/persistence-entry.ts` is outside the router and is not imported by the application. It uses bundle splitting because Expo SQLite loads its web worker dynamically.

Expo web currently masks some injected SQLite constraint errors as `Error finalizing statement`. The contract accepts that adapter-specific error, then independently verifies the database rolled back completely. It does not treat the rejection alone as evidence of rollback.

For native validation, run the same `runPersistenceContract` against `openDatabaseAsync` in a development build with disposable databases. No UsageStats permission is involved. Native execution remains unverified in the current cloud environment because no device/emulator is available.

## Deliberately deferred

Android usage observation, scheduled context activation, deadline scoring, autonomous interventions, notifications, AI behavior analysis, and simultaneous independently enforced contexts are outside Step 6.

For Windows setup, source transfer, and phone testing, see [Run on Windows](RUN_ON_WINDOWS.md).
