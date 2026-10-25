# Run Step 6 on Windows

The Step 6 changes were made in the cloud checkout. Your existing local Step 5 folder does not update automatically, and publishing the Codex environment does not transfer code to your PC.

## Get the updated source

Download `alignment-step6-source.zip`. It contains the full current source, including Step 6 and the lint fixes. It excludes `.env` files, dependencies, generated Expo data, and Git metadata.

Keep `D:\alignment` as your Step 5 backup. Extract the archive into a **new, empty** directory such as `D:\alignment-step6`. The archive has `package.json` at its root. Do not overwrite an existing project with uncommitted work.

In PowerShell, adjusting the download path if needed:

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\alignment-step6-source.zip" -DestinationPath "D:\alignment-step6"
cd D:\alignment-step6
node --version
npm --version
npm ci
npm run lint
npm run typecheck
npm test
```

Use Node.js 24: the test suite uses its built-in SQLite. Install Node 24 from the official Node.js site if necessary, then open a new terminal. If PowerShell blocks `npm.ps1`, run `npm.cmd` instead of `npm`; you do not need to weaken the machine's execution policy.

The archive is a source copy, not a Git checkout. Keep your existing Git repository. Once you have reviewed the new version, the source changes can be integrated into that repository; there is no need to initialize a second repository merely to test it.

## Browser development

```powershell
cd D:\alignment-step6
npm run web --workspace=mobile -- --port 8082
```

Open the address Expo prints in your local terminal. Keep that terminal running. Press Ctrl+C when finished. To clear a stale Metro cache, add `--clear` to the same command.

Step 6 works locally without an API key. Enter and confirm your Direction manually if the AI analysis API is unavailable.

The browser stores app data by origin. Port 8082 may therefore start with different local data from your previous port. Do not clear browser storage or uninstall a mobile app if you want to preserve its existing data. The app applies migration v4 automatically to an existing v3 database when it opens it.

## Optional automated browser checks

Keep the web server on port 8082 running. In a second PowerShell terminal:

```powershell
cd D:\alignment-step6
npx playwright install chromium
npm run test:web
```

These checks use a fresh browser profile and disposable test databases. They do not erase your normal browser's Alignment data.

## Android phone

For manual native validation, install an Expo Go version compatible with the project's Expo SDK 57, connect the phone and PC to the same Wi-Fi, then run:

```powershell
cd D:\alignment-step6
npm run mobile
```

Scan the QR code with Expo Go. Allow the Node/Expo server through Windows Firewall on your private network if prompted. If Expo Go reports an SDK mismatch, use a compatible client or a development build; do not change project dependency versions just to silence that message.

If an Android emulator is already running, `npm run mobile:android` starts Expo and opens it there. A physical phone is enough for the manual checks below; installing Android Studio is not required just to try the app through a compatible Expo Go client.

## Optional AI Direction analysis

This backend is needed for AI Direction suggestions, not for Step 6 contexts or assessments.

Preserve and reuse your existing local `apps\api\.env` if it already works. In the new source folder, the backend expects `OPENAI_API_KEY` directly. The cloud-only `ALIGNMENT_OPENAI_KEY` alias is unnecessary on your PC. Never put this key in the mobile app or an `EXPO_PUBLIC_*` variable.

The example files show the required settings. Create the real `.env` files locally using your editor if needed, without overwriting existing values. Then start the API in a separate terminal:

```powershell
cd D:\alignment-step6
npm run api
```

For browser testing, set the mobile `.env` value to:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:3001
```

For a physical Android phone, use your PC's Wi-Fi IPv4 address (shown by `ipconfig`), for example `http://192.168.1.20:3001`. On a phone, `localhost` means the phone itself. For the standard Android Studio emulator, the PC address is usually `http://10.0.2.2:3001`.

Restart Expo after changing the mobile `.env`. The API listens on port 3001 by default; permit it on your private network if testing from a phone.

## Manual Step 6 checks

1. Create a Promise and start it through the current-intention form.
2. Mark its minimum reached. Confirm the Promise is kept and the current intention remains active; continuing is optional.
3. Switch to leisure. Confirm the Promise stays kept and leisure becomes current.
4. Choose open time. An uncertain conflict report must not generate inferred adverse drift.
5. Set a short freshness checkpoint and wait for it. Expiration should produce unknown intention, not a missed Promise or automatic drift.
6. In “Review what happened,” submit an example and correct it. Check that the preceding interpretation remains viewable.
7. Correct a past intention with a different effective time. Confirm the historical period is shown separately from the time the correction was recorded.
8. Close and reopen the app. Fresh context should restore; expired context should not be treated as current.

Native device validation remains a manual check. The cloud environment verified Node tests, Expo SQLite's web adapter, and the browser workflow.
