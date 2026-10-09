import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const frontendDir = import.meta.dirname;
const backendDir = path.resolve(frontendDir, "..", "backend");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(frontendDir, ".playwright-browsers");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:5176",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: ".\\.venv\\Scripts\\python.exe run_e2e_server.py",
      cwd: backendDir,
      url: "http://127.0.0.1:8016/api/health/",
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: "node ./node_modules/vite/bin/vite.js --config vite.e2e.config.ts",
      cwd: frontendDir,
      url: "http://127.0.0.1:5176/",
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
