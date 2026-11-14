// Capture real SiteWatch UI (dark theme, 2x) from the running app for the launch video.
// Usage (from frontend/): node ../brag-output/work/capture.cjs
const { chromium } = require(process.cwd() + "/node_modules/@playwright/test");
const W = __dirname;
const A = `${W}/assets`;
const BASE = "http://localhost:3071";

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("theme", "dark"); } catch {}
    const hide = () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(s); };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", hide) : hide();
  });
  const p = await ctx.newPage();
  const settle = async () => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(600); };
  const shot = async (sel, name) => { await p.locator(sel).first().screenshot({ path: `${A}/${name}.png` }); console.log("captured", name); };

  // 1. Dashboard (starter dataset)
  await p.goto(`${BASE}/`); await settle();
  await p.screenshot({ path: `${A}/dash.png` });
  for (const id of ["kpi-sites", "kpi-alerts", "kpi-coverage", "kpi-missing", "sites-card", "alerts-card", "trends-card", "assistant-card", "dashboard-filters"]) await shot(`[data-testid=${id}]`, id);
  await shot("[data-sidebar=sidebar]", "sidebar");
  await shot("header", "header");
  await shot("[data-sidebar=sidebar] a[href='/']", "logo-link");

  // 2. Data Management: sign in, a file with typos, then the real file
  await p.goto(`${BASE}/data`); await settle();
  if (!process.env.BRAG_ADMIN_TOKEN) throw new Error("Set BRAG_ADMIN_TOKEN to the capture backend's ADMIN_TOKEN");
  await p.fill("#admin-token", process.env.BRAG_ADMIN_TOKEN);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByTestId("admin-signed-in").waitFor();
  await p.getByTestId("drop-readings").locator("input[type=file]").setInputFiles(`${W}/week46-typo.csv`);
  await p.getByTestId("preview-button").click();
  await p.locator("[data-testid=validation-report][data-valid=false]").waitFor(); await p.waitForTimeout(400);
  await shot("[data-testid=drop-readings]", "drop-typo");
  await shot("[data-testid=validation-report]", "validation-invalid");
  await p.getByTestId("drop-readings").locator("input[type=file]").setInputFiles(`${W}/week46.csv`);
  await p.fill("#dataset-name", "Week 46 readings");
  await p.getByTestId("preview-button").click();
  await p.locator("[data-testid=validation-report][data-valid=true]").waitFor(); await p.waitForTimeout(400);
  await shot("[data-testid=drop-readings]", "drop-good");
  await shot("[data-testid=preview-stats]", "preview-stats");
  await shot("[data-testid=upload-card]", "upload-card");
  await p.getByTestId("activate-button").click();
  await p.getByTestId("data-notice").waitFor(); await p.waitForTimeout(800);
  await shot("[data-testid=data-notice]", "data-notice");
  await shot("[data-testid=history-card]", "history-card");

  // 3. Dashboard after activation (v1)
  await p.goto(`${BASE}/`); await settle();
  await p.screenshot({ path: `${A}/dash-v1.png` });
  for (const id of ["kpi-sites", "kpi-alerts", "kpi-coverage", "kpi-missing"]) await shot(`[data-testid=${id}]`, `${id}-v1`);
  await shot("[data-sidebar=sidebar] [data-testid=data-source-status]", "status-v1");

  // 4. Live Groq answer on the assistant page
  await p.goto(`${BASE}/assistant`); await settle();
  const box = p.getByLabel("Message SiteWatch AI");
  await box.fill("Which sites exceeded their limits?");
  await shot("main form", "ask-typed");
  await p.getByRole("button", { name: "Send message" }).click();
  const answer = p.getByTestId("assistant-message").first();
  await answer.waitFor({ timeout: 120_000 }); await p.waitForTimeout(800);
  console.log("answer:", (await answer.innerText()).replace(/\s+/g, " ").slice(0, 300));
  await shot("[data-testid=chat-log]", "chat-log");
  await answer.screenshot({ path: `${A}/answer.png` });

  // 5. Reports
  await p.goto(`${BASE}/reports`); await settle();
  await p.screenshot({ path: `${A}/reports.png` });
  await shot("[data-testid=report-pdf]", "report-pdf-btn");
  await b.close();
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
