import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the real FastAPI backend and a production Next.js build.
// Dedicated ports avoid clashing with a dev server you may already have running.
const API_PORT = process.env.E2E_API_PORT ?? "8011";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3011";
const API_URL = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  metadata: { apiUrl: API_URL },
  webServer: [
    {
      command: `python -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      // No AI key: the assistant must show its setup message rather than answer.
      env: { CORS_ORIGINS: `http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}`, ANTHROPIC_API_KEY: "" },
    },
    {
      command: `npm run build && npx next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: { NEXT_PUBLIC_API_BASE_URL: API_URL },
    },
  ],
});
