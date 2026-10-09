import { expect, test, type Page } from "@playwright/test";
import { metrics } from "./metrics.ts";
import { installApi, signedInState } from "./mock.ts";

const widths = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const viewport of widths) {
  test(`${viewport.name} login form stays usable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const state = signedInState(metrics({}));
    state.me = "out";
    await installApi(page, state);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test(`${viewport.name} dashboard keeps cards, header, and alerts readable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const state = signedInState(metrics({ cpu: 85, memory: 40 }));
    await installApi(page, state);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Smart Server Monitoring Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "CPU usage", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Memory usage", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Disk usage", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "High CPU Usage" })).toBeVisible();
    const cpu = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "CPU usage", exact: true }),
    });
    await expect(cpu.getByText("85.0%", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}
