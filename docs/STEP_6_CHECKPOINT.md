# Step 6 checkpoint — November 8, 2026

Branch: `codex/step6-context-foundation`. The commit introducing this document records the dependency-cleanup checkpoint. Step 7 remains deferred.

This is a functional Step 6 checkpoint with known dependency advisories, not a claim of a clean security audit. The user reported successful browser and device checks before this dependency update. A brief Android smoke test of the updated dependencies is still needed; the cloud has no Android device or emulator.

## Changes

- Expo stays on SDK 57: `57.0.30` → `57.0.32`, Router `57.0.28` → `57.0.30`, and the related SDK-compatible patches selected by Expo's installer. React remains `19.2.3`; React Native remains `0.86.3`.
- The lockfile now includes Fastify `5.12.8`, fast-uri `4.2.3` / `3.1.9`, node-forge `1.4.3`, and Expo config plugins `57.0.12` with xcode `4.0.0`. The vulnerable uuid dependency and old deepmerge dependency are removed.
- API and shared schemas use Zod `4.6.7`. The shared schema package now declares its own dependency instead of relying on accidental workspace hoisting. Existing schema definitions and API behavior remain unchanged. Real Fastify routes and OpenAI SDK structured-response parsing are tested with an intercepted HTTP transport and a dummy key; no live API calls are made.
- Windows instructions use the Git branch instead of the unavailable ZIP and preserve the user's browser origin and SQLite data.

No database migration, context/drift rule, Android permission, or Step 7 feature is introduced by this cleanup.

## Verification

Run from a clean `npm ci` installation on Node 24:

- `npm run lint`
- `npm run typecheck`
- `npm test`: 44 tests, including four new API/schema compatibility tests, the pure engine, migrations v0–v4, rollback, idempotency, and retrospective history.
- `npm run test:web`: 15 Expo SQLite persistence/migration checks and the Promise → intention → minimum → leisure → reload → review workflow.
- `npm run test:web:locks`: four grouped browser ownership/reload/recovery checks.
- `npx expo install --check` in `apps/mobile`: installed dependencies match SDK 57's bundled compatibility list. This check used offline mode; it does not replace device testing or a native build.

The SDK documentation endpoint was unavailable from this environment. Dependency selection used Expo's installer and the installed SDK's bundled version list. Metro used its bundled React Native DevTools fallback because the cloud home cache is read-only; this does not block the app or browser tests.

## Remaining audit findings

`npm audit --json` on November 8, 2026 reports **14 affected packages: 3 high, 11 moderate, 0 low, 0 critical**. The same-day pre-update audit reported 25 (6 high, 17 moderate, 2 low). The earlier count of 13 was from an older advisory snapshot, so it is not the appropriate before/after comparison. Counts include parent packages affected by transitive dependencies; there are four underlying advisories left.

| Dependency path | Actual concern | Why retained / follow-up |
| --- | --- | --- |
| Expo Router 57 → query-string 7.1.3 → decode-uri-component 0.2.2 | Malformed percent-encoded URL input can cause excessive CPU work. Potentially relevant to incoming links; this is a runtime issue, not merely a development-tool finding. [Exponential decoding](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [quadratic replacement](https://github.com/advisories/GHSA-qr28-fpjm-wq7f). | SDK 57's current Router still requires query-string 7. The fixed decoder 0.5.1 is ESM, while query-string 7 requires a callable CommonJS module; a blind override is incompatible. npm proposes Router 58.0.30, a major upgrade. Revisit when a compatible SDK 57 fix ships, or in a separately validated SDK upgrade. |
| Expo → @expo/fingerprint 0.20.15 → glob 13.0.7 | [AbortSignal cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) can continue filesystem traversal after cancellation. Used in project fingerprint/build tooling. | This parent requires glob 13; the fixed major is 14. Other updated Expo tooling already uses glob 14.0.4. Follow a compatible fingerprint update rather than overriding its dependency contract. |
| @expo/fingerprint and TypeScript ESLint → minimatch 10.2.6 | [Glob pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) can exhaust resources. The identified uses are fingerprint and lint tooling; Alignment does not pass behavior reports to these tools. | Fix requires minimatch 11.0.1 or later, outside the parents' declared major. Follow upstream compatible releases. Do not process untrusted project/configuration patterns through these tools. |

No `--force`, global dependency overrides, advisory suppression, or Expo SDK downgrade was used. npm's suggested forced remedies include Expo 52 and ESLint config 6; these are not appropriate for the working SDK 57 application. Remaining findings must be revisited before treating this checkpoint as ready for public distribution. No live-key AI request or native production build was validated here.

To reproduce the audit, run `npm ci` followed by `npm audit` at the repository root. Audit results can change as advisories are published. Exit code 1 is expected while these findings remain.

## Final device check

After pulling this commit and running `npm ci`, launch on Android and check: start a Promise; reach its minimum while the intention continues; switch to leisure; close and reopen to confirm persistence. Preserve the installed app and its storage. Report any error before changing dependency versions. Instructions are in [Run on Windows](RUN_ON_WINDOWS.md).
