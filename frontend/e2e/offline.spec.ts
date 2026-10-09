import { expect, test } from "@playwright/test";
import { metrics } from "./metrics.ts";
import { clickRefresh, installApi, signedInState } from "./mock.ts";

test("a failed first load can recover on refresh", async ({ page }) => {
  const state = signedInState(metrics({ cpu: 33, timestamp: "2026-10-09T09:00:00Z" }));
  state.healthUp = false;
  state.metricsResult = "offline";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installApi(page, state);
  await page.goto("/");

  await expect(page.getByText("API offline")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("monitoring API");
  await expect(page.getByRole("heading", { name: "Metrics unavailable" })).toBeVisible();
  await expect(page.getByText("0.0%")).toHaveCount(0);

  state.healthUp = true;
  state.metricsResult = "ok";
  await clickRefresh(page);
  await expect(page.getByText("API online", { exact: true })).toBeVisible();
  await expect(page.getByText("33.0%")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a metrics 401 ends the session and stops polling", async ({ page }) => {
  const state = signedInState(metrics({ cpu: 15 }));
  const seen: number[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/metrics/") {
      seen.push(Date.now());
    }
  });
  await installApi(page, state);
  await page.goto("/");
  await expect(page.getByText("15.0%")).toBeVisible();

  state.metricsResult = "error";
  state.errorStatus = 401;
  state.errorBody = { detail: "Authentication credentials were not provided." };
  await clickRefresh(page);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Your session has ended. Sign in again.");
  await expect(page.getByRole("heading", { name: "CPU usage" })).toHaveCount(0);
  const after = seen.length;
  await page.waitForTimeout(6_000);
  expect(seen.length).toBe(after);
});

test("a metrics 403 returns to sign-in with an access message", async ({ page }) => {
  const state = signedInState(metrics({ cpu: 15 }));
  await installApi(page, state);
  await page.goto("/");
  await expect(page.getByText("15.0%")).toBeVisible();

  state.metricsResult = "error";
  state.errorStatus = 403;
  state.errorBody = { detail: "You do not have access to monitoring data." };
  await clickRefresh(page);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("You do not have access to monitoring data.");
  await expect(page.getByText("15.0%")).toHaveCount(0);
});
