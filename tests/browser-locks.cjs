const { chromium } = require("playwright");
const { existsSync } = require("node:fs");
const assert = require("node:assert/strict");
const base = process.env.ALIGNMENT_TEST_URL || "http://localhost:8082";
(async () => {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    // All pages share one fresh browser profile: browser.newPage() alone would
    // isolate storage and miss the real cross-tab OPFS conflict.
    const context = await browser.newContext();
    const errors = [];
    context.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(error.message)),
    );
    const owner = await context.newPage();
    await owner.goto(base);
    await owner
      .getByPlaceholder(
        "For example: I want to stop losing my evenings scrolling, take school more seriously, work consistently on things I care about, and make more time for people.",
      )
      .fill("My original direction must survive browser reloads.");
    await owner.getByText("Continue", { exact: true }).click();
    await owner.getByText("Remember this", { exact: true }).click();
    await owner.waitForURL("**/direction-setup");
    await owner.goto(`${base}/promise/new`);
    await owner
      .getByPlaceholder("Work on my game tonight")
      .fill("Preserve my promise");
    await owner
      .getByPlaceholder("Work on the project")
      .nth(0)
      .fill("Ten minutes");
    await owner
      .getByPlaceholder("Work on the project")
      .nth(1)
      .fill("One minute");
    await owner.getByText("Make this promise", { exact: true }).click();
    await owner.getByText("Start this promise", { exact: true }).click();
    await owner
      .getByRole("button", { name: "Use this intention now", exact: true })
      .click();
    await owner.waitForURL(/\/promise\/\d+$/);
    const promiseUrl = owner.url();
    await owner.getByText("I reached the minimum", { exact: true }).click();
    await owner
      .getByText("Promise kept. Continuing is optional.", { exact: true })
      .waitFor();

    const waiting = await context.newPage();
    await waiting.goto(promiseUrl);
    await waiting
      .getByText("Waiting to open your local data", { exact: true })
      .waitFor();
    assert.equal(
      await waiting.getByText("Current intention", { exact: true }).count(),
      0,
    );
    await owner.close();
    await waiting
      .getByText("Promise kept. Continuing is optional.", { exact: true })
      .waitFor();
    console.log(
      "PASS: second tab waits before SQLite opens, then acquires the same saved data after owner closes",
    );

    for (let i = 0; i < 5; i++) {
      await waiting.reload();
      await waiting
        .getByText("Promise kept. Continuing is optional.", { exact: true })
        .waitFor();
    }
    console.log(
      "PASS: repeated reloads preserve the kept promise and current intention",
    );

    const queued = await context.newPage();
    await queued.goto(promiseUrl);
    await queued
      .getByText("Waiting to open your local data", { exact: true })
      .waitFor();
    await waiting.reload();
    await queued
      .getByText("Promise kept. Continuing is optional.", { exact: true })
      .waitFor();
    await waiting
      .getByText("Waiting to open your local data", { exact: true })
      .waitFor();
    await queued.close();
    await waiting
      .getByText("Promise kept. Continuing is optional.", { exact: true })
      .waitFor();
    console.log(
      "PASS: reload with a queued tab transfers ownership without concurrent database workers",
    );
    await waiting.close();

    const legacy = await context.newPage();
    await legacy.route("**/__legacy_sqlite_owner", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html><body><script src="/apps/mobile/tests/legacy-lock-entry.bundle?platform=web&dev=true&hot=false&lazy=true"></script></body></html>',
      }),
    );
    await legacy.goto(`${base}/__legacy_sqlite_owner`);
    await legacy.waitForFunction(
      () => !!globalThis.legacySQLiteReady,
      {},
      { timeout: 60000 },
    );
    assert.equal(
      await legacy.evaluate(() => globalThis.legacySQLiteReady),
      true,
    );
    const recovery = await context.newPage();
    await recovery.goto(promiseUrl);
    await recovery
      .getByText("Local data is still in use", { exact: true })
      .waitFor();
    await recovery
      .getByText(
        "Do not clear site data. It contains your goals and promises.",
        { exact: true },
      )
      .waitFor();
    await legacy.close();
    await recovery
      .getByRole("button", { name: "Try again", exact: true })
      .click();
    await recovery
      .getByText("Promise kept. Continuing is optional.", { exact: true })
      .waitFor();
    await recovery.goto(`${base}/today`);
    await recovery
      .getByText("My original direction must survive browser reloads.", {
        exact: true,
      })
      .waitFor();
    await recovery.getByText("Preserve my promise", { exact: true }).first().waitFor();
    console.log(
      "PASS: legacy-worker conflict has a recoverable screen; retry preserves original direction and promise",
    );
    assert.deepEqual(errors, [], "No uncaught browser errors");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
