import { expect, test, type Page } from "@playwright/test";
import { readE2EAccount } from "./account.ts";
import { metrics } from "./metrics.ts";
import { installApi, signedInState } from "./mock.ts";

const CHARTS = ["CPU Usage", "Memory Usage", "Disk Usage", "Django HTTP Requests"];

function resultValue(page: Page, label: string) {
  return page.getByRole("region", { name: "Test results" }).locator(`[data-result="${label}"]`);
}

function progressValue(page: Page, label: string) {
  return page.locator(`[data-progress="${label}"]`);
}

test("signed-out visitors see login instead of analytics", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CPU Usage" })).toHaveCount(0);
  expect((await page.request.get("/api/analytics/history/?metric=cpu&range=15m")).status()).toBe(401);
});

test("navigation moves between overview and analytics without a reload", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "samples";
  state.historyRequests = [];
  await installApi(page, state);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Smart Server Monitoring Dashboard" })).toBeVisible();
  await page.getByRole("link", { name: "Analytics & API Testing" }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole("heading", { name: "Analytics & API Testing" })).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Smart Server Monitoring Dashboard" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Analytics & API Testing" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Smart Server Monitoring Dashboard" })).toBeVisible();
});

test("analytics keeps the session after refresh", async ({ page }) => {
  const account = readE2EAccount();
  await page.goto("/");
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Analytics & API Testing" }).click();
  await expect(page.getByRole("heading", { name: "Analytics & API Testing" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Analytics & API Testing" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${account.username}`)).toBeVisible();
});

test("four charts render the provided samples", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "samples";
  await installApi(page, state);
  await page.goto("/analytics");
  for (const title of CHARTS) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  const cpu = page.getByRole("region", { name: "CPU Usage" });
  await expect(cpu.locator("title", { hasText: "12.5% at 2023-11-14T22:13:20.000Z" })).toHaveCount(1);
  await expect(cpu.locator("title", { hasText: "18.0% at 2023-11-14T22:13:35.000Z" })).toHaveCount(1);
  const http = page.getByRole("region", { name: "Django HTTP Requests" });
  await expect(http.locator("title", { hasText: "0.2 req/s at 2023-11-14T22:13:20.000Z" })).toHaveCount(1);
  await expect(http.locator("title", { hasText: "0.4 req/s at 2023-11-14T22:13:35.000Z" })).toHaveCount(1);
  await expect(page.locator(".chart-card").filter({ has: page.locator(".recharts-surface") })).toHaveCount(4);
  await expect(page.getByText(/rate\(\)/)).toBeVisible();
  await expect(page.getByText("Prometheus online", { exact: true })).toBeVisible();
});

test("time range selection requests that range", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "samples";
  state.historyRequests = [];
  await installApi(page, state);
  await page.goto("/analytics");
  await expect.poll(() => state.historyRequests?.some((item) => item.metric === "cpu" && item.range === "15m")).toBe(true);
  await page.getByRole("button", { name: "Last 1 hour" }).click();
  await expect.poll(() => state.historyRequests?.some((item) => item.metric === "http_requests" && item.range === "1h")).toBe(true);
  await expect(page.getByRole("button", { name: "Last 1 hour" })).toHaveAttribute("aria-pressed", "true");
});

test("empty prometheus data shows an empty state", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "empty";
  await installApi(page, state);
  await page.goto("/analytics");
  await expect(page.getByText("No samples in this range.")).toHaveCount(4);
  await expect(page.locator(".chart-card svg")).toHaveCount(0);
  await expect(page.getByText("Prometheus online", { exact: true })).toBeVisible();
});

test("prometheus errors show an unavailable state and retry", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "error";
  state.historyRequests = [];
  await installApi(page, state);
  await page.goto("/analytics");
  await expect(page.getByRole("alert")).toContainText("Prometheus is not reachable.");
  await expect(page.getByText("History is unavailable.")).toHaveCount(4);
  await expect(page.locator(".chart-card svg")).toHaveCount(0);
  const before = state.historyRequests.length;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => (state.historyRequests?.length ?? 0) > before).toBe(true);
});

test("invalid request counts are rejected", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "empty";
  await installApi(page, state);
  let healthHits = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/health/") {
      healthHits += 1;
    }
  });
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Manual API Testing" })).toBeVisible();
  const before = healthHits;
  for (const value of ["0", "-3", "1.5", "201"]) {
    await page.getByLabel("Number of Requests").fill(value);
    await page.getByRole("button", { name: "Send Requests" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  }
  expect(healthHits).toBe(before);
});

test("manual testing sends the requested health checks and records statuses", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "empty";
  await installApi(page, state);
  const statuses: number[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/health/") {
      statuses.push(response.status());
    }
  });
  await page.goto("/analytics");
  await page.getByLabel("Number of Requests").fill("4");
  await page.getByRole("button", { name: "Send Requests" }).click();
  await expect(resultValue(page, "Total Requested")).toHaveText("4");
  await expect(resultValue(page, "Completed Requests")).toHaveText("4");
  await expect(resultValue(page, "Successful Requests")).toHaveText("4");
  await expect(resultValue(page, "Failed Requests")).toHaveText("0");
  await expect(resultValue(page, "HTTP Status Codes")).toHaveText("200: 4");
  await expect(resultValue(page, "Success Rate")).toHaveText("100.0%");
  await expect(resultValue(page, "Average Response Time")).not.toHaveText("Unavailable");
  await expect(resultValue(page, "Total Execution Time")).not.toHaveText("Unavailable");
  expect(statuses).toEqual([200, 200, 200, 200]);
});

test("a real django health batch is measured", async ({ page }) => {
  const account = readE2EAccount();
  await page.goto("/");
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Analytics & API Testing" }).click();
  await expect(page.getByRole("heading", { name: "Analytics & API Testing" })).toBeVisible();
  const statuses: number[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/health/") {
      statuses.push(response.status());
    }
  });
  await page.getByLabel("Endpoint").selectOption({ label: "GET /api/health/" });
  await page.getByLabel("Number of Requests").fill("4");
  await page.getByRole("button", { name: "Send Requests" }).click();
  await expect(resultValue(page, "Successful Requests")).toHaveText("4");
  await expect(resultValue(page, "Failed Requests")).toHaveText("0");
  await expect(resultValue(page, "HTTP Status Codes")).toHaveText("200: 4");
  const average = await resultValue(page, "Average Response Time").innerText();
  const elapsed = await resultValue(page, "Total Execution Time").innerText();
  expect(average).toMatch(/^\d+\.\d ms$/);
  expect(elapsed).toMatch(/^\d+\.\d ms$/);
  expect(average).not.toBe("0.0 ms");
  expect(statuses).toEqual([200, 200, 200, 200]);
  await expect(page.getByText(/sessionid|csrftoken/i)).toHaveCount(0);
});

test("cancel stops the remaining requests", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "empty";
  await installApi(page, state);
  let healthHits = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/health/") {
      healthHits += 1;
    }
  });
  await page.goto("/analytics");
  await page.getByLabel("Number of Requests").fill("30");
  await page.getByRole("button", { name: "Send Requests" }).click();
  await expect(page.getByRole("button", { name: "Send Requests" })).toBeDisabled();
  await expect.poll(async () => Number(await progressValue(page, "Requests started").innerText())).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Cancel Test" }).click();
  await expect.poll(async () => Number(await progressValue(page, "Cancelled requests").innerText())).toBeGreaterThan(0);
  await expect.poll(async () => Number(await progressValue(page, "Requests completed").innerText())).toBeLessThan(30);
  const stoppedAt = healthHits;
  await page.waitForTimeout(400);
  expect(healthHits).toBe(stoppedAt);
  expect(healthHits).toBeLessThan(30);
});

test("logout stops request generation", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "empty";
  await installApi(page, state);
  let healthHits = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/health/") {
      healthHits += 1;
    }
  });
  await page.goto("/analytics");
  await page.getByLabel("Number of Requests").fill("40");
  await page.getByRole("button", { name: "Send Requests" }).click();
  await expect.poll(() => healthHits).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const stoppedAt = healthHits;
  await page.waitForTimeout(500);
  expect(healthHits).toBe(stoppedAt);
});

test("an expired analytics session returns to login", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "unauthorized";
  await installApi(page, state);
  await page.goto("/analytics");
  await expect(page.getByRole("alert")).toHaveText("Your session has ended. Sign in again.");
  await expect(page.getByRole("heading", { name: "CPU Usage" })).toHaveCount(0);
});

test("analytics layout and coffee theme hold at three widths", async ({ page }) => {
  const state = signedInState(metrics({}));
  state.history = "samples";
  await installApi(page, state);
  const widths = [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1280, height: 800 },
  ];
  for (const viewport of widths) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics & API Testing" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, viewport.name).toBeLessThanOrEqual(1);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe("rgb(249, 248, 246)");
    const card = await page.locator(".chart-card").first().evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(card).toBe("rgb(255, 248, 240)");
    const boxes = await page.locator(".chart-card").evaluateAll((nodes) =>
      nodes.slice(0, 2).map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y };
      }),
    );
    if (viewport.name === "desktop") {
      expect(boxes[1]?.x).toBeGreaterThan((boxes[0]?.x ?? 0) + 40);
    } else {
      expect(boxes[1]?.y).toBeGreaterThan((boxes[0]?.y ?? 0) + 40);
    }
  }
});
