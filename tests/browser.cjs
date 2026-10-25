// Start Metro first: EXPO_OFFLINE=1 npm run web --workspace=mobile -- --port 8082
const { chromium } = require("playwright");
const { existsSync } = require("node:fs");
const base = process.env.ALIGNMENT_TEST_URL || "http://localhost:8082";
(async () => {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const contract = await browser.newPage();
    const errors = [];
    contract.on("pageerror", (error) => errors.push(error.message));
    await contract.route("**/__step6_contract", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html><body><script src="/apps/mobile/tests/persistence-entry.bundle?platform=web&dev=true&hot=false&lazy=true"></script></body></html>',
      }),
    );
    await contract.goto(`${base}/__step6_contract`);
    await contract.waitForFunction(
      () => !!globalThis.step6Contract,
      {},
      { timeout: 60000 },
    );
    const results = await contract.evaluate(() => globalThis.step6Contract);
    for (const result of results)
      console.log(
        `${result.passed ? "PASS" : "FAIL"}: ${result.name}${result.error ? " — " + result.error : ""}`,
      );
    if (results.some((result) => !result.passed))
      throw new Error("Expo SQLite persistence contract failed.");
    await contract.close();
    // Separate ephemeral browser storage; this never opens the user's real browser profile.
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/promise/new`);
    await page
      .getByPlaceholder("Work on my game tonight")
      .fill("Build Alignment");
    await page
      .getByPlaceholder("Work on the project")
      .nth(0)
      .fill("Build the full feature");
    await page
      .getByPlaceholder("Work on the project")
      .nth(1)
      .fill("Work for five minutes");
    await page.getByText("Make this promise", { exact: true }).click();
    await page.getByText("Start this promise", { exact: true }).click();
    await page
      .getByRole("button", { name: "Use this intention now", exact: true })
      .click();
    await page.waitForURL(/\/promise\/\d+$/);
    await page.getByText("I reached the minimum", { exact: true }).click();
    await page
      .getByText(
        "Promise kept. Continuing is optional. Your current intention continues until you change it or its freshness checkpoint passes.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByText("Promise kept. Continuing is optional.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Switch intention", exact: true })
      .click();
    await page.getByRole("radio", { name: "Leisure", exact: true }).click();
    await page
      .getByRole("button", { name: "Use this intention now", exact: true })
      .click();
    await page.waitForURL(/\/promise\/\d+$/);
    await page.getByText("Leisure", { exact: true }).waitFor();
    await page.reload();
    await page
      .getByRole("button", { name: "Review what happened", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Check this example", exact: true })
      .click();
    await page.getByText("Current interpretation", { exact: true }).waitFor();
    await page
      .getByRole("radio", { name: "This was intentional", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save review", exact: true })
      .click();
    await page
      .getByText(
        "You described a deliberate change. It is not treated as unwanted drift.",
        { exact: true },
      )
      .first()
      .waitFor();
    await page
      .getByRole("button", {
        name: "See the preceding interpretation",
        exact: true,
      })
      .click();
    await page.getByText("Earlier interpretation", { exact: true }).waitFor();
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      "PASS: UI promise → intention → minimum kept → leisure → reload → report → review → historical interpretation",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
