import { expect, test, type Page } from "@playwright/test";

// Runs after dashboard.spec.ts (alphabetical, one worker) and restores the starter dataset at the end.
const API = `http://localhost:${process.env.E2E_API_PORT ?? "8011"}`;
const TOKEN = process.env.E2E_ADMIN_TOKEN ?? "e2e-admin-token-0123456789";

const WEEK_46 = [
  "site_id,site_name,sensor,timestamp,value",
  "S1,125 Broad St,noise_dba,2026-11-09T08:00:00,92",
  "S1,125 Broad St,vibration_ppv,2026-11-09T08:00:00,0.31",
  "S4,Pier 17,dust_pm10,2026-11-09T09:00:00,",
  "S4,Pier 17,dust_pm10,2026-11-09T10:00:00,120",
].join("\n") + "\n";
const BAD = [
  "site_id,site_name,sensor,timestamp,value",
  "S1,125 Broad St,noise_dba,2026-11-09T08:00:00,92",
  "S 2,Bad Site,noise_dba,2026-11-09T08:00:00,80",
  "S1,125 Broad St,noise_dba,yesterday,loud",
].join("\n") + "\n";

const csv = (name: string, text: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });

async function signIn(page: Page) {
  await page.goto("/data");
  await page.locator("#admin-token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("admin-signed-in")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("data management", () => {
  test("uploads are restricted to administrators", async ({ page, request }) => {
    const res = await request.post(`${API}/api/datasets/preview`, {
      headers: { "X-SiteWatch-Admin": "1" },
      multipart: { readings: { name: "r.csv", mimeType: "text/csv", buffer: Buffer.from(WEEK_46) } },
    });
    expect(res.status()).toBe(401);
    await page.goto("/data");
    await expect(page.getByTestId("admin-sign-in")).toBeVisible();
    await expect(page.getByTestId("preview-button")).toBeDisabled();
    await expect(page.getByTestId("activate-button")).toBeDisabled();
    await expect(page.getByTestId("version-row-0")).toContainText("Starter dataset");
    await page.locator("#admin-token").fill("not-the-token");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That admin access token is not valid.")).toBeVisible();
  });

  test("invalid files show blocking errors with row numbers and cannot be activated", async ({ page }) => {
    await signIn(page);
    await page.getByTestId("drop-readings").locator("input[type=file]").setInputFiles(csv("bad.csv", BAD));
    await expect(page.getByTestId("drop-readings-name")).toHaveText("bad.csv");
    await page.getByTestId("preview-button").click();
    await expect(page.getByTestId("validation-report")).toHaveAttribute("data-valid", "false");
    await expect(page.getByTestId("issue-rows-INVALID_SITE_ID")).toContainText("3");
    await expect(page.getByTestId("issue-rows-INVALID_TIMESTAMP")).toContainText("4");
    await expect(page.getByTestId("activate-button")).toBeDisabled();
  });

  test("preview does not change the active dataset; activation updates every page; rollback restores", async ({ page }) => {
    await signIn(page);
    await page.getByTestId("drop-readings").locator("input[type=file]").setInputFiles(csv("week46.csv", WEEK_46));
    await page.locator("#dataset-name").fill("Week 46 readings");
    await page.getByTestId("preview-button").click();
    await expect(page.getByTestId("validation-report")).toHaveAttribute("data-valid", "true");
    await expect(page.getByTestId("stat-Total rows")).toHaveText("4");
    await expect(page.getByTestId("stat-Exceedances")).toHaveText("1");
    await expect(page.getByTestId("stat-Missing readings")).toHaveText("1");
    await expect(page.getByTestId("preview-comparison")).toContainText("Sites added");
    await expect(page.getByTestId("preview-table")).toContainText("blank");
    // Previewing changed nothing.
    await expect(page.getByTestId("active-dataset-label")).toHaveText("v0 · Starter dataset");
    await expect(page.getByTestId("nav-alert-count")).toHaveText("5");

    await page.getByTestId("activate-button").click();
    await expect(page.getByTestId("data-notice")).toContainText("v1 · Week 46 readings was saved and is now active");
    await expect(page.getByTestId("active-dataset-label")).toHaveText("v1 · Week 46 readings");
    await expect(page.getByTestId("version-row-1").getByTestId("active-badge")).toBeVisible();
    await expect(page.getByTestId("nav-alert-count")).toHaveText("1");

    // Other pages read the new version.
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-count")).toContainText("1 exceedance at 1 site");
    await page.goto("/sites");
    await expect(page.getByTestId("sites-table")).toContainText("Pier 17");
    await page.goto("/sensors");
    await expect(page.getByTestId("sensor-history-chart")).toBeVisible();
    await expect(page.getByTestId("chart-coverage")).toHaveText("Data covers Nov 9, 2026");
    await page.goto("/settings");
    await expect(page.getByRole("main").getByText("v1 · Week 46 readings")).toBeVisible();

    // Downloads come from the active version.
    await page.goto("/reports");
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("report-pdf").click()]);
    expect(pdf.suggestedFilename()).toMatch(/^sitewatch-summary-v1-\d{8}\.pdf$/);

    // Roll back to the starter dataset.
    await page.goto("/data");
    await expect(page.getByTestId("version-chart")).toBeVisible();
    await page.getByTestId("activate-0").click();
    await expect(page.getByTestId("data-notice")).toContainText("v0 · Starter dataset is now the active dataset");
    await expect(page.getByTestId("nav-alert-count")).toHaveText("5");
    await page.goto("/sites");
    await expect(page.getByTestId("sites-table")).not.toContainText("Pier 17");
  });
});
