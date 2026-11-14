import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// End-to-end tests run the real FastAPI backend and a production Next.js build.
// Dedicated ports avoid clashing with a dev server you may already have running.
const API_PORT = process.env.E2E_API_PORT ?? "8011";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3011";
const API_URL = `http://localhost:${API_PORT}`;
// Dataset tests sign in with this test-only token and store uploads in a fresh, throwaway SQLite file.
export const E2E_ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN ?? "e2e-admin-token-0123456789";
const E2E_DB = path.join(os.tmpdir(), `sitewatch-e2e-${process.pid}-${Date.now()}.sqlite3`).replaceAll("\\", "/");

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
      env: {
        CORS_ORIGINS: `http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}`,
        AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "", GROQ_API_KEY: "",
        DATABASE_URL: `sqlite:///${E2E_DB}`, ADMIN_TOKEN: E2E_ADMIN_TOKEN,
      },
    },
    {
      command: `npm run build && npx next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: { NEXT_PUBLIC_API_BASE_URL: API_URL, NEXT_DIST_DIR: ".next-e2e" },
    },
  ],
});
