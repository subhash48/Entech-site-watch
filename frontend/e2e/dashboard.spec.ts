import { expect, test, type Page } from "@playwright/test";

const API = `http://localhost:${process.env.E2E_API_PORT ?? "8011"}`;

async function chooseOption(page: Page, testId: string, option: string) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("dashboard shows real CSV-derived data", () => {
  test("overview KPIs match the API and the CSV", async ({ page, request }) => {
    const overview = await (await request.get(`${API}/api/overview`)).json();
    // Values derived from readings.csv / thresholds.json: 3 sites, 5 exceedances, 9 normal, 1 missing.
    expect(overview.totals).toMatchObject({ total_sites: 3, sites_with_alerts: 3, exceeded_readings: 5,
      normal_readings: 9, missing_data_readings: 1, total_readings: 15 });

    await page.goto("/");
    await expect(page.getByTestId("kpi-sites-value")).toHaveText("3");
    await expect(page.getByTestId("kpi-affected-value")).toHaveText("3");
    await expect(page.getByTestId("kpi-exceedances-value")).toHaveText("5");
    await expect(page.getByTestId("kpi-normal-value")).toHaveText("9");
    await expect(page.getByTestId("kpi-missing-value")).toHaveText("1");
    await expect(page.getByTestId("data-source-status")).toHaveAttribute("data-state", "connected");
    await expect(page.getByTestId("validation-notice")).toContainText("Value is blank");
    await expect(page.getByTestId("sites-table").getByRole("row")).toHaveCount(4);
    await expect(page.getByTestId("recent-alerts").getByRole("listitem")).toHaveCount(5);
    await expect(page.getByTestId("trends-chart")).toBeVisible();
    await page.getByRole("tab", { name: "Dust (PM10)" }).click();
    await expect(page.getByText("shown as a gap, not zero")).toBeVisible();
  });

  test("sensor readings: pagination, filters, sorting, missing values", async ({ page }) => {
    await page.goto("/readings");
    const rows = page.getByTestId("readings-table").locator("tbody tr");
    await expect(rows).toHaveCount(10);
    await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 1–10 of 15 readings");
    await page.getByTestId("next-page").click();
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 11–15 of 15 readings");

    await chooseOption(page, "filter-status", "Exceeded");
    await expect(rows).toHaveCount(5);
    for (const row of await rows.all()) await expect(row).toHaveAttribute("data-status", "EXCEEDED");

    await chooseOption(page, "filter-status", "Missing data");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByTestId("missing-value")).toHaveText("Missing");
    await expect(rows.first()).toContainText("Value is blank");
    await expect(rows.first()).not.toContainText(/\b0\b(?! ?ug)/);

    await chooseOption(page, "filter-status", "All statuses");
    await chooseOption(page, "filter-site", "125 Broad St (S1)");
    await chooseOption(page, "filter-sensor", "Noise");
    await expect(rows).toHaveCount(2);

    await page.getByTestId("sort-timestamp").click();
    await expect(rows.first()).toContainText("2:00 PM");
  });

  test("time range filter and header search", async ({ page }) => {
    await page.goto("/readings");
    await page.getByTestId("filter-start").fill("2026-11-02T10:00");
    await page.getByTestId("filter-end").fill("2026-11-02T11:30");
    await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 1–5 of 5 readings");

    await page.getByRole("searchbox", { name: "Search sensor readings" }).or(page.getByLabel("Search sensor readings")).first().fill("atlantic");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/readings\?q=atlantic/);
    await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 1–5 of 5 readings");
  });

  test("empty state when nothing matches", async ({ page }) => {
    await page.goto("/readings?site_id=S1&status=MISSING_DATA");
    await expect(page.getByText("No readings match these filters")).toBeVisible();
  });

  test("alerts show only exceedances and keep missing data separate", async ({ page }) => {
    await page.goto("/alerts");
    const rows = page.getByTestId("alerts-table").locator("tbody tr");
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId("missing-callout")).toContainText("Missing data is not an exceedance");
    await expect(rows.first()).toContainText("Queens Plaza North");
    await expect(rows.first()).toContainText("0.55 in/s");
    await expect(rows.first()).toContainText("10%");
    await chooseOption(page, "alerts-site", "125 Broad St (S1)");
    await expect(rows).toHaveCount(2);
    await chooseOption(page, "alerts-sensor", "Vibration");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("+0.12 in/s");
    await expect(rows.first()).toContainText("24%");
  });

  test("site detail groups readings by sensor", async ({ page }) => {
    await page.goto("/sites");
    await page.getByTestId("site-card-S2").click();
    await expect(page).toHaveURL(/\/sites\/S2$/);
    await expect(page.getByRole("heading", { name: "40 Atlantic Ave" })).toBeVisible();
    const dust = page.getByTestId("sensor-group-dust_pm10");
    await expect(dust).toContainText("Limit 150 ug/m3");
    await expect(dust).toContainText("Missing");
    await expect(dust).toContainText("+21");
    await page.getByRole("radio", { name: "Noise" }).click();
    await expect(page.getByTestId("sensor-group-dust_pm10")).toHaveCount(0);
    await expect(page.getByTestId("sensor-group-noise_dba")).toBeVisible();
  });

  test("unknown site shows an error state", async ({ page }) => {
    await page.goto("/sites/S99");
    await expect(page.getByRole("alert").filter({ hasText: "Could not load data" })).toContainText("Unknown site_id 'S99'");
  });

  test("report: copy and download", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/reports");
    const report = page.getByTestId("report-text");
    await expect(report).toContainText("SiteWatch Monitoring Summary");
    await expect(report).toContainText("5 readings (33%) exceeded their limits at 3 sites");
    await expect(report).toContainText("not treated as zero");

    await page.getByRole("button", { name: "Copy report" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("SiteWatch Monitoring Summary");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .txt" }).click();
    expect((await download).suggestedFilename()).toBe("sitewatch-report-all-sites-2026-11-02.txt");

    await chooseOption(page, "report-scope", "125 Broad St (S1)");
    await expect(report).toContainText("Scope: 125 Broad St (S1)");
  });

  test("dark mode toggle", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

test.describe("states", () => {
  test("API offline shows an error with retry", async ({ page }) => {
    await page.route(`${API}/api/overview`, (route) => route.abort());
    await page.goto("/");
    await expect(page.getByText("Could not load data")).toBeVisible();
    await expect(page.getByTestId("data-source-status")).toHaveAttribute("data-state", "offline");
    await page.unroute(`${API}/api/overview`);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("kpi-exceedances-value")).toHaveText("5");
  });
});

test.describe("SiteWatch AI", () => {
  test("without an AI key the assistant shows setup steps, never a fake answer", async ({ page, request }) => {
    const status = await (await request.get(`${API}/api/chat/status`)).json();
    expect(status.configured).toBe(false);
    const res = await request.post(`${API}/api/chat`, { data: { messages: [{ role: "user", content: "Which sites exceeded?" }] } });
    expect(res.status()).toBe(503);

    await page.goto("/assistant");
    await expect(page.getByTestId("ai-setup")).toContainText("ANTHROPIC_API_KEY");
    await expect(page.getByLabel("Message SiteWatch AI")).toBeDisabled();
  });

  test("floating panel renders grounded answers with sources (provider mocked)", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    // Only the network response is mocked here; the backend agent itself is covered by pytest.
    await page.route(`${API}/api/chat/status`, (route) => route.fulfill({
      json: { configured: true, provider: "anthropic", model: "claude-opus-5-5", message: "SiteWatch AI is ready." } }));
    await page.route(`${API}/api/chat`, async (route) => {
      const body = route.request().postDataJSON();
      expect(body.messages.at(-1)).toEqual({ role: "user", content: "Which sites exceeded their limits?" });
      await route.fulfill({ json: {
        answer: "All three sites exceeded a limit:\n\n| Site | Exceedances |\n|---|---|\n| 125 Broad St | 2 |",
        sources: [{ type: "data", name: "readings.csv" }, { type: "data", name: "thresholds.json" }],
        tool_calls: [{ name: "get_sites", arguments: {}, ok: true }], refused: false, model: "claude-opus-5-5" } });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Open SiteWatch AI assistant" }).click();
    await page.getByRole("button", { name: "Which sites exceeded their limits?" }).click();
    const answer = page.getByTestId("assistant-message");
    await expect(answer).toContainText("All three sites exceeded a limit");
    await expect(answer.getByRole("table")).toBeVisible();
    await expect(answer.getByLabel("Sources")).toContainText("readings.csv");
    await expect(answer.getByLabel("Sources")).toContainText("thresholds.json");
    await answer.getByRole("button", { name: "Copy response" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("All three sites exceeded a limit");
  });
});

test.describe("responsive", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile layout has no horizontal scroll and a working sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("kpi-exceedances-value")).toHaveText("5");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await page.getByRole("link", { name: "Alerts" }).click();
    await expect(page).toHaveURL(/\/alerts$/);
  });
});
