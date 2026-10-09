import { expect, test } from "@playwright/test";
import { metrics } from "./metrics.ts";
import { clickRefresh, installApi, signedInState } from "./mock.ts";

test("polling requests a new snapshot about five seconds after the last one", async ({ page }) => {
  test.setTimeout(20_000);
  const state = signedInState(metrics({ cpu: 11, timestamp: "2026-10-09T08:00:00Z" }));
  const seen: number[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/metrics/") {
      seen.push(Date.now());
    }
  });
  await installApi(page, state);
  await page.goto("/");
  await expect(page.getByText("11.0%")).toBeVisible();
  await expect.poll(() => seen.length, { timeout: 12_000 }).toBeGreaterThanOrEqual(3);

  const gaps: number[] = [];
  for (let index = 1; index < seen.length; index += 1) {
    gaps.push(seen[index] - seen[index - 1]);
  }
  const pollGap = gaps.find((gap) => gap >= 4_000);
  expect(pollGap).toBeDefined();
  expect(pollGap as number).toBeLessThan(9_000);
  expect(seen.length).toBeLessThanOrEqual(4);
  expect(page.url()).toContain("127.0.0.1:5176");
});

test("manual refresh replaces readings without dropping the cards", async ({ page }) => {
  const state = signedInState(metrics({ cpu: 11, timestamp: "2026-10-09T08:00:00Z" }));
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let holdNext = false;
  await installApi(page, state);
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/metrics/" && holdNext) {
      holdNext = false;
      await gate;
      state.metrics = metrics({ cpu: 22, timestamp: "2026-10-09T08:05:00Z" });
    }
    await route.fallback();
  });
  await page.goto("/");
  await expect(page.getByText("11.0%")).toBeVisible();

  holdNext = true;
  await clickRefresh(page);
  await expect(page.getByText("11.0%")).toBeVisible();
  release();
  await expect(page.getByText("22.0%")).toBeVisible();
  await expect(page.locator("time")).toHaveAttribute("datetime", "2026-10-09T08:05:00Z");
  await expect(page.getByRole("heading", { name: "CPU usage" })).toBeVisible();
});

test("a failed refresh shows an error and a later poll recovers", async ({ page }) => {
  test.setTimeout(20_000);
  const state = signedInState(metrics({ cpu: 11, timestamp: "2026-10-09T08:00:00Z" }));
  await installApi(page, state);
  await page.goto("/");
  await expect(page.getByText("11.0%")).toBeVisible();

  state.metricsResult = "error";
  state.errorStatus = 500;
  state.errorBody = { error: "Internal server error." };
  await clickRefresh(page);
  await expect(page.getByRole("alert")).toHaveText("Internal server error.");
  await expect(page.getByText("11.0%")).toBeVisible();

  state.metricsResult = "ok";
  state.metrics = metrics({ cpu: 18, timestamp: "2026-10-09T08:06:00Z" });
  await expect(page.getByText("18.0%")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("API online", { exact: true })).toBeVisible();
});

test("logout stops further metric polling", async ({ page }) => {
  const state = signedInState(metrics({ cpu: 11 }));
  const seen: number[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/metrics/") {
      seen.push(Date.now());
    }
  });
  await installApi(page, state);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const after = seen.length;
  await page.waitForTimeout(6_000);
  expect(seen.length).toBe(after);
});
