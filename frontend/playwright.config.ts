import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  projects: [
    {
      name: "default",
      use: { ...devices["Desktop Chrome"], headless: true },
      testIgnore: /drag-dnd/,
    },
    {
      name: "dnd",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        headless: true,
        viewport: { width: 1280, height: 720 },
      },
      testMatch: /drag-dnd/,
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
