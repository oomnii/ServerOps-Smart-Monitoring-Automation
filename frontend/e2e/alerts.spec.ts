import { expect, test, type Page } from "@playwright/test";
import { metrics } from "./metrics.ts";
import { clickRefresh, installApi, signedInState, type MockState } from "./mock.ts";

async function show(page: Page, state: MockState, cpu: number, memory: number, first: boolean): Promise<void> {
  state.metrics = metrics({ cpu, memory, timestamp: "2026-10-09T08:00:00Z" });
  if (first) {
    await page.goto("/");
  } else {
    await clickRefresh(page);
  }
  await expect(page.getByText(`${cpu.toFixed(1)}%`).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
}

test("cpu and memory alerts follow the 80 percent threshold", async ({ page }) => {
  const state = signedInState(metrics({ cpu: 0, memory: 50 }));
  await installApi(page, state);

  const cases: Array<{ cpu: number; memory: number; cpuAlert: boolean; memoryAlert: boolean }> = [
    { cpu: 0, memory: 50, cpuAlert: false, memoryAlert: false },
    { cpu: 79, memory: 50, cpuAlert: false, memoryAlert: false },
    { cpu: 79.9, memory: 79.9, cpuAlert: false, memoryAlert: false },
    { cpu: 80, memory: 50, cpuAlert: true, memoryAlert: false },
    { cpu: 85, memory: 50, cpuAlert: true, memoryAlert: false },
    { cpu: 100, memory: 50, cpuAlert: true, memoryAlert: false },
    { cpu: 60, memory: 50, cpuAlert: false, memoryAlert: false },
    { cpu: 10, memory: 80, cpuAlert: false, memoryAlert: true },
    { cpu: 10, memory: 90, cpuAlert: false, memoryAlert: true },
    { cpu: 10, memory: 70, cpuAlert: false, memoryAlert: false },
    { cpu: 90, memory: 90, cpuAlert: true, memoryAlert: true },
  ];

  for (const [index, item] of cases.entries()) {
    await show(page, state, item.cpu, item.memory, index === 0);
    const cpuAlert = page.getByRole("heading", { name: "High CPU Usage" });
    const memoryAlert = page.getByRole("heading", { name: "High Memory Usage" });
    if (item.cpuAlert) {
      await expect(cpuAlert).toBeVisible();
      await expect(page.getByRole("article").filter({ has: cpuAlert })).toContainText(`${item.cpu.toFixed(1)}%`);
    } else {
      await expect(cpuAlert).toHaveCount(0);
    }
    if (item.memoryAlert) {
      await expect(memoryAlert).toBeVisible();
    } else {
      await expect(memoryAlert).toHaveCount(0);
    }
  }
});

test("stale readings hide alerts until a fresh snapshot returns", async ({ page }) => {
  const state = signedInState(metrics({ cpu: 90, memory: 40, timestamp: "2026-10-09T08:00:00Z" }));
  await installApi(page, state);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "High CPU Usage" })).toBeVisible();

  state.healthUp = false;
  state.metricsResult = "offline";
  await clickRefresh(page);
  await expect(page.getByText("API offline")).toBeVisible();
  await expect(page.getByText("(stale)")).toBeVisible();
  await expect(page.getByText("Resource alerts are hidden until a fresh reading arrives.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "High CPU Usage" })).toHaveCount(0);

  state.healthUp = true;
  state.metricsResult = "ok";
  state.metrics = metrics({ cpu: 20, memory: 40, timestamp: "2026-10-09T08:10:00Z" });
  await clickRefresh(page);
  await expect(page.getByText("API online", { exact: true })).toBeVisible();
  await expect(page.getByText("20.0%")).toBeVisible();
  await expect(page.getByRole("heading", { name: "High CPU Usage" })).toHaveCount(0);
  await expect(page.getByText("No resource alerts. CPU and memory are below 80%.")).toBeVisible();
});
