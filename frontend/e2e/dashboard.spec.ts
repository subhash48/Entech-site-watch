import { expect, test, type Page } from "@playwright/test";

const API = `http://localhost:${process.env.E2E_API_PORT ?? "8011"}`;

async function chooseOption(page: Page, testId: string, option: string) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("dashboard matches the CSV-derived data", () => {
  test("KPI cards, sidebar badge, sites and alerts come from the API", async ({ page, request }) => {
    const overview = await (await request.get(`${API}/api/overview`)).json();
    // readings.csv + thresholds.json: 3 sites, 5 exceedances, 9 normal, 1 missing out of 15.
    expect(overview.totals).toMatchObject({ total_sites: 3, sites_with_alerts: 3, exceeded_readings: 5,
      normal_readings: 9, missing_data_readings: 1, total_readings: 15 });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();
    await expect(page.getByTestId("kpi-sites-value")).toHaveText("3");
    await expect(page.getByTestId("kpi-alerts-value")).toHaveText("5");
    await expect(page.getByTestId("kpi-coverage-value")).toHaveText("14 / 15");
    await expect(page.getByTestId("kpi-coverage")).toContainText("93%");
    await expect(page.getByTestId("kpi-missing-value")).toHaveText("1");
    await expect(page.getByTestId("nav-alert-count")).toHaveText("5");
    await expect(page.getByTestId("data-source-status")).toHaveAttribute("data-state", "connected");

    const siteRows = page.getByTestId("sites-table").locator("tbody tr");
    await expect(siteRows).toHaveCount(3);
    await expect(page.getByTestId("site-row-S2")).toContainText("40 Atlantic Ave");
    await expect(page.getByTestId("site-row-S2")).toContainText("4 / 5");

    const alerts = page.getByTestId("alert-rows").locator("a");
    await expect(alerts).toHaveCount(3);
    await expect(alerts.first()).toContainText("Vibration Limit Exceeded");
    await expect(alerts.first()).toContainText("0.55 in/s");
    await expect(alerts.first()).toContainText("(limit: 0.5 in/s)");
    await expect(alerts.first()).toHaveAttribute("data-severity", "medium");
    await expect(alerts.nth(1)).toHaveAttribute("data-severity", "high");
    await expect(page.getByTestId("alerts-card")).toContainText("Latest 3 of 5 threshold exceedances");
  });

  test("filters update every card and count", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("kpi-alerts-value")).toHaveText("5");

    await chooseOption(page, "filter-site", "125 Broad St");
    await expect(page.getByTestId("kpi-alerts-value")).toHaveText("2");
    await expect(page.getByTestId("kpi-sites-value")).toHaveText("1");
    await expect(page.getByTestId("sites-table").locator("tbody tr")).toHaveCount(1);
    await expect(page.getByTestId("alert-rows").locator("a")).toHaveCount(2);

    await chooseOption(page, "filter-site", "All Sites");
    await chooseOption(page, "filter-sensor", "Noise");
    await expect(page.getByTestId("kpi-alerts-value")).toHaveText("2");
    await expect(page.getByTestId("kpi-coverage-value")).toHaveText("5 / 5");

    await chooseOption(page, "filter-sensor", "All Sensor Types");
    await chooseOption(page, "filter-status", "Missing data");
    await expect(page.getByTestId("kpi-missing-value")).toHaveText("1");
    await expect(page.getByTestId("kpi-alerts-value")).toHaveText("0");
    await expect(page.getByTestId("alerts-card")).toContainText("No exceedances");

    await page.getByRole("button", { name: "Reset" }).click();
    await chooseOption(page, "filter-date", "Nov 2, 2026");
    await expect(page.getByTestId("kpi-alerts-value")).toHaveText("5");
  });

  test("alert trends use real hourly data", async ({ page }) => {
    await page.goto("/");
    const legend = page.getByTestId("trend-legend");
    await expect(legend.locator("li").nth(0)).toContainText("Vibration2of 5 readings");
    await expect(legend.locator("li").nth(1)).toContainText("Noise2of 5 readings");
    await expect(legend.locator("li").nth(2)).toContainText("Dust1of 5 readings");
    await expect(page.getByTestId("trends-card")).toContainText("Hourly buckets · times as recorded on Nov 2, 2026");
    await page.getByRole("button", { name: "readings" }).click();
    await expect(legend).toContainText("15 readings in view");
  });

  test("clicking a site opens its readings", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("site-row-S2").getByRole("link").click();
    await expect(page).toHaveURL(/\/sites\/S2$/);
    await expect(page.getByRole("heading", { name: "40 Atlantic Ave" })).toBeVisible();
    const dust = page.getByTestId("sensor-group-dust_pm10");
    await expect(dust).toContainText("Limit 150 ug/m3");
    await expect(dust).toContainText("Missing");
    await expect(dust).toContainText("+21");
    await page.getByRole("radio", { name: "Noise" }).click();
    await expect(page.getByTestId("sensor-group-dust_pm10")).toHaveCount(0);
  });

  test("notifications list real exceedances", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("notifications").click();
    const menu = page.getByRole("menu");
    await expect(menu).toContainText("5 total");
    await expect(menu.getByRole("menuitem")).toHaveCount(6); // 5 alerts + "View all alerts"
    await menu.getByRole("menuitem", { name: "View all alerts" }).click();
    await expect(page).toHaveURL(/\/alerts$/);
  });
});

test.describe("sensors, search and navigation", () => {
  test("sensor readings: pagination, filters, sorting, missing values", async ({ page }) => {
    await page.goto("/sensors");
    const rows = page.getByTestId("readings-table").locator("tbody tr");
    await expect(rows).toHaveCount(10);
    await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 1–10 of 15 readings");
    await page.getByTestId("next-page").click();
    await expect(rows).toHaveCount(5);

    await chooseOption(page, "filter-status", "Exceeded");
    await expect(rows).toHaveCount(5);
    for (const row of await rows.all()) await expect(row).toHaveAttribute("data-status", "EXCEEDED");

    await chooseOption(page, "filter-status", "Missing data");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByTestId("missing-value")).toHaveText("Missing");
    await expect(rows.first()).toContainText("Value is blank");

    await chooseOption(page, "filter-status", "All statuses");
    await chooseOption(page, "filter-site", "125 Broad St (S1)");
    await chooseOption(page, "filter-sensor", "Noise");
    await expect(rows).toHaveCount(2);
    await page.getByTestId("sort-timestamp").click();
    await expect(rows.first()).toContainText("2:00 PM");

    await page.goto("/sensors");
    await page.getByTestId("filter-start").fill("2026-11-02T10:00");
    await page.getByTestId("filter-end").fill("2026-11-02T11:30");
    await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 1–5 of 5 readings");
  });

  test("header search (Ctrl+K) and the old /readings link", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const search = page.getByLabel("Search sensor readings");
    await expect(search).toBeFocused();
    await search.fill("atlantic");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sensors\?q=atlantic/);
    await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 1–5 of 5 readings");

    await page.goto("/readings?status=MISSING_DATA");
    await expect(page).toHaveURL(/\/sensors/);
  });

  test("every sidebar page opens with its title", async ({ page }) => {
    await page.goto("/");
    for (const [label, title] of [["Sites", "Construction Sites"], ["Alerts", "Threshold Exceedances"],
      ["Sensors", "Sensor Readings"], ["Reports", "Client Reports"], ["Data Management", "Data Management"],
      ["AI Assistant", "AI Assistant"],
      ["Settings", "Settings"], ["Dashboard", "Operations Dashboard"]]) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    }
  });

  test("empty state and unknown site", async ({ page }) => {
    await page.goto("/sensors?site_id=S1&status=MISSING_DATA");
    await expect(page.getByText("No readings match these filters")).toBeVisible();
    await page.goto("/sites/S99");
    await expect(page.getByRole("alert").filter({ hasText: "Could not load data" })).toContainText("Unknown site_id 'S99'");
  });
});

test.describe("alerts and reports", () => {
  test("alerts page shows only exceedances and keeps missing data separate", async ({ page }) => {
    await page.goto("/alerts");
    const rows = page.getByTestId("alerts-table").locator("tbody tr");
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId("missing-callout")).toContainText("Missing data is not an exceedance");
    await chooseOption(page, "alerts-site", "125 Broad St (S1)");
    await expect(rows).toHaveCount(2);
    await chooseOption(page, "alerts-sensor", "Vibration");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("+0.12 in/s");
    await expect(rows.first()).toContainText("24%");
  });

  test("report: real text, copy and download", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/reports");
    const report = page.getByTestId("report-text");
    await expect(report).toContainText("SiteWatch Monitoring Summary");
    await expect(report).toContainText("5 readings (33%) exceeded their limits at 3 sites");
    await page.getByRole("button", { name: "Copy report" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("SiteWatch Monitoring Summary");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .txt" }).click();
    expect((await download).suggestedFilename()).toBe("sitewatch-report-all-sites-2026-11-02.txt");
    await chooseOption(page, "report-scope", "125 Broad St (S1)");
    await expect(report).toContainText("Scope: 125 Broad St (S1)");
  });

  test("dark mode from the workspace menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Workspace menu" }).click();
    await expect(page.getByRole("menu")).toContainText("No sign-in configured");
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("API offline shows an error with retry", async ({ page }) => {
    await page.route(`${API}/api/overview`, (route) => route.abort());
    await page.goto("/");
    await expect(page.getByText("Could not load data")).toBeVisible();
    await expect(page.getByTestId("data-source-status")).toHaveAttribute("data-state", "offline");
    await page.unroute(`${API}/api/overview`);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("kpi-alerts-value")).toHaveText("5");
  });
});

test.describe("Project AI Assistant", () => {
  test("without an AI key it shows setup steps, never a fake answer", async ({ page, request }) => {
    expect((await (await request.get(`${API}/api/chat/status`)).json()).configured).toBe(false);
    const res = await request.post(`${API}/api/chat`, { data: { messages: [{ role: "user", content: "Which sites exceeded?" }] } });
    expect(res.status()).toBe(503);
    await page.goto("/");
    await expect(page.getByTestId("assistant-card").getByTestId("ai-setup")).toContainText("ANTHROPIC_API_KEY");
    await expect(page.getByTestId("assistant-card").getByLabel("Message SiteWatch AI")).toBeDisabled();
  });

  test("dashboard chat renders grounded answers with sources (provider mocked)", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    // Only the network response is mocked; the backend agent itself is covered by pytest.
    await page.route(`${API}/api/chat/status`, (route) => route.fulfill({
      json: { configured: true, provider: "anthropic", model: "claude-opus-5-5", message: "SiteWatch AI is ready." } }));
    await page.route(`${API}/api/chat`, async (route) => {
      expect(route.request().postDataJSON().messages.at(-1)).toEqual({ role: "user", content: "Show all noise exceedances." });
      await route.fulfill({ json: {
        answer: "Two noise readings exceeded the 85 dBA limit:\n\n| Site | Value | Time |\n|---|---|---|\n| Queens Plaza North | 91 dBA | 7:30 AM |\n| 125 Broad St | 88 dBA | 10:00 AM |",
        sources: [{ type: "data", name: "readings.csv" }, { type: "data", name: "thresholds.json" }],
        tool_calls: [{ name: "get_exceedances", arguments: { sensor: "noise" }, ok: true }], refused: false, model: "claude-opus-5-5" } });
    });

    await page.goto("/");
    const card = page.getByTestId("assistant-card");
    await card.getByRole("button", { name: "Show all noise exceedances." }).click();
    const answer = card.getByTestId("assistant-message");
    await expect(answer).toContainText("Two noise readings exceeded the 85 dBA limit");
    await expect(answer.getByRole("table")).toBeVisible();
    await expect(answer.getByLabel("Sources")).toContainText("Source: readings.csv, thresholds.json");
    await answer.getByRole("button", { name: "Copy response" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Two noise readings exceeded");
  });
});

test.describe("responsive", () => {
  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("no horizontal scroll on any page; off-canvas navigation works", async ({ page }) => {
      for (const path of ["/", "/sites", "/sites/S2", "/alerts", "/sensors", "/reports", "/data", "/assistant", "/settings"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
      }
      await page.goto("/");
      await page.getByRole("button", { name: "Toggle Sidebar" }).click();
      await page.getByRole("link", { name: "Alerts", exact: true }).click();
      await expect(page).toHaveURL(/\/alerts$/);
    });
  });

  test.describe("tablet", () => {
    test.use({ viewport: { width: 900, height: 1200 } });
    test("sidebar collapses to an icon rail", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("[data-slot=sidebar]").first()).toHaveAttribute("data-state", "collapsed");
      await expect(page.getByTestId("kpi-alerts-value")).toHaveText("5");
    });
  });
});

test.describe("compact dashboard", () => {
  for (const [width, height] of [[1440, 900], [1920, 1080]]) {
    test(`fits one ${width}x${height} viewport without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.getByTestId("alert-rows").locator("li")).toHaveCount(3);
      const m = await page.evaluate(() => {
        const box = (id: string) => document.querySelector(`[data-testid=${id}]`)!.getBoundingClientRect();
        const table = document.querySelector("[data-testid=sites-table]")!;
        return {
          scroll: document.documentElement.scrollHeight - window.innerHeight,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          tableOverflow: table.scrollWidth - table.parentElement!.clientWidth,
          kpi: box("kpi-sites").height,
          alertRow: document.querySelector("[data-testid=alert-rows] li")!.getBoundingClientRect().height,
          assistantBottom: box("assistant-card").bottom,
        };
      });
      expect(m.scroll).toBeLessThanOrEqual(0);
      expect(m.overflow).toBeLessThanOrEqual(0);
      expect(m.tableOverflow).toBeLessThanOrEqual(0);
      expect(m.kpi).toBeGreaterThanOrEqual(90);
      expect(m.kpi).toBeLessThanOrEqual(105);
      expect(m.alertRow).toBeGreaterThanOrEqual(56);
      expect(m.alertRow).toBeLessThanOrEqual(64);
      expect(m.assistantBottom).toBeLessThanOrEqual(height);
    });
  }

  test("AI preview links to the full assistant and keeps only the latest exchange", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(`${API}/api/chat/status`, (route) => route.fulfill({
      json: { configured: true, provider: "groq", model: "openai/gpt-oss-120b", message: "SiteWatch AI is ready." } }));
    let n = 0;
    await page.route(`${API}/api/chat`, (route) => route.fulfill({ json: {
      answer: n++ === 0 ? "First answer." : "Second answer.", sources: [{ type: "data", name: "readings.csv" }],
      tool_calls: [], refused: false, model: "openai/gpt-oss-120b" } }));
    await page.goto("/");
    const card = page.getByTestId("assistant-card");
    await card.getByRole("button", { name: "Which sites exceeded their limits?" }).click();
    await expect(card.getByTestId("assistant-message")).toContainText("First answer.");
    await card.getByLabel("Message SiteWatch AI").fill("And which sensors have missing data?");
    await card.getByRole("button", { name: "Send message" }).click();
    await expect(card.getByTestId("assistant-message")).toHaveCount(1);
    await expect(card.getByTestId("assistant-message")).toContainText("Second answer.");
    await expect(card.getByTestId("earlier-messages")).toHaveText("2 earlier messages · open the full conversation");
    await card.getByTestId("open-assistant").click();
    await expect(page).toHaveURL(/\/assistant$/);
    await expect(page.getByText("First answer.")).toBeVisible();                // full history on the page
  });
});
