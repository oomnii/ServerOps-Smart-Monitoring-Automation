import { expect, test } from "@playwright/test";
import { readE2EAccount } from "./account.ts";
import { metrics } from "./metrics.ts";
import { clickRefresh, installApi, signedInState } from "./mock.ts";

test("fixture metrics render cpu, memory, and disk", async ({ page }) => {
  const state = signedInState(metrics({
    cpu: 12.5,
    memory: 40,
    disk: 25,
    cores: 8,
    timestamp: "2026-10-09T08:15:00Z",
  }));
  await installApi(page, state);
  await page.goto("/");

  const cpu = page.getByRole("article").filter({ hasText: "CPU usage" });
  await expect(cpu.getByText("12.5%")).toBeVisible();
  await expect(cpu.getByText("Logical cores")).toBeVisible();
  await expect(cpu.getByText("8", { exact: true })).toBeVisible();
  await expect(cpu.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12.5");

  const memory = page.getByRole("article").filter({ hasText: "Memory usage" });
  await expect(memory.getByText("40.0%")).toBeVisible();
  await expect(memory.getByText("Used")).toBeVisible();
  await expect(memory.getByText("Total")).toBeVisible();
  await expect(memory.getByText("Available")).toBeVisible();
  await expect(memory.getByText("3.0 GiB")).toBeVisible();
  await expect(memory.getByText("7.5 GiB")).toBeVisible();

  const disk = page.getByRole("article").filter({ hasText: "Disk usage" });
  await expect(disk.getByText("25.0%")).toBeVisible();
  await expect(disk.getByText("Free")).toBeVisible();
  await expect(disk.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");

  await expect(page.locator("time")).toHaveAttribute("datetime", "2026-10-09T08:15:00Z");
  await expect(page.getByText("API online", { exact: true })).toBeVisible();
  await expect(page.getByText("No resource alerts. CPU and memory are below 80%.")).toBeVisible();
});

test("malformed metrics do not show a fake zero", async ({ page }) => {
  const cases: Array<{ body: unknown; message: string }> = [
    {
      body: {
        timestamp_utc: "2026-10-09T08:00:00Z",
        cpu: { logical_cores: 4 },
        memory: { total_bytes: 10, used_bytes: 1, available_bytes: 9, memory_percent: 10 },
        disk: { total_bytes: 10, used_bytes: 1, free_bytes: 9, disk_percent: 10 },
      },
      message: "The API returned an invalid CPU percentage.",
    },
    {
      body: metrics({ cpu: 140 }),
      message: "The API returned an invalid CPU percentage.",
    },
    {
      body: {
        ...metrics({ memory: 10 }),
        memory: { total_bytes: -1, used_bytes: 1, available_bytes: 1, memory_percent: 10 },
      },
      message: "The API returned an invalid total memory.",
    },
    {
      body: { ...metrics({}), disk: { disk_percent: 10 } },
      message: "The API returned an invalid total disk space.",
    },
    {
      body: { ...metrics({}), timestamp_utc: "not-a-time" },
      message: "The metrics timestamp from the API was invalid.",
    },
  ];

  const state = signedInState(metrics({}));
  state.metricsResult = "error";
  state.errorStatus = 200;
  state.errorBody = cases[0].body;
  await installApi(page, state);

  for (const item of cases) {
    state.errorBody = item.body;
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText(item.message);
    await expect(page.getByRole("heading", { name: "Metrics unavailable" })).toBeVisible();
    await expect(page.getByText("0.0%")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "High CPU Usage" })).toHaveCount(0);
  }
});

test("http 500 keeps the page usable", async ({ page }) => {
  const state = signedInState(metrics({ cpu: 15, timestamp: "2026-10-09T08:00:00Z" }));
  await installApi(page, state);
  await page.goto("/");
  await expect(page.getByText("15.0%")).toBeVisible();

  state.metricsResult = "error";
  state.errorStatus = 500;
  state.errorBody = { error: "Internal server error." };
  await clickRefresh(page);
  await expect(page.getByRole("alert")).toHaveText("Internal server error.");
  await expect(page.getByText("(stale)")).toBeVisible();
  await expect(page.getByText("15.0%")).toBeVisible();
  await expect(page.getByText("Resource alerts are hidden until a fresh reading arrives.")).toBeVisible();
});

test("real backend metrics render on the dashboard", async ({ page }) => {
  const account = readE2EAccount();
  await page.goto("/");
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "CPU usage", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Memory usage", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Disk usage", exact: true })).toBeVisible();
  await expect(page.getByText("Logical cores")).toBeVisible();
  await expect(page.getByText("API online", { exact: true })).toBeVisible();
  await expect(page.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  const bars = page.getByRole("progressbar");
  await expect(bars).toHaveCount(3);
  for (const bar of await bars.all()) {
    const now = Number(await bar.getAttribute("aria-valuenow"));
    expect(now).toBeGreaterThanOrEqual(0);
    expect(now).toBeLessThanOrEqual(100);
  }
});
