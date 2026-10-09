import { expect, type Page } from "@playwright/test";
import { json, type FixtureMetrics } from "./metrics.ts";

export interface MockState {
  me: "in" | "out" | "forbidden";
  healthUp: boolean;
  metrics: FixtureMetrics;
  metricsResult: "ok" | "offline" | "error";
  errorStatus: number;
  errorBody: unknown;
  history?: "samples" | "empty" | "error" | "unauthorized";
  historyRequests?: Array<{ metric: string | null; range: string | null }>;
}

export function signedInState(snapshot: FixtureMetrics): MockState {
  return {
    me: "in",
    healthUp: true,
    metrics: snapshot,
    metricsResult: "ok",
    errorStatus: 500,
    errorBody: { error: "Internal server error." },
  };
}

export async function clickRefresh(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Refresh" });
  await expect(button).toBeEnabled();
  await button.click();
}

export async function installApi(page: Page, state: MockState): Promise<void> {
  await page.context().addCookies([
    { name: "csrftoken", value: "fixture-csrf", url: "http://127.0.0.1:5176/" },
  ]);
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me/") {
      if (state.me === "in") {
        await route.fulfill(json({ authenticated: true, username: "fixture-staff" }));
        return;
      }
      if (state.me === "forbidden") {
        await route.fulfill(json({ detail: "You do not have access to monitoring data." }, 403));
        return;
      }
      await route.fulfill(json({ detail: "Authentication credentials were not provided." }, 401));
      return;
    }
    if (pathname === "/api/auth/csrf/") {
      await route.fulfill({
        ...json({ detail: "CSRF cookie set." }),
        headers: { "set-cookie": "csrftoken=fixture-csrf; Path=/" },
      });
      return;
    }
    if (pathname === "/api/auth/logout/") {
      await route.fulfill(json({ success: true }));
      return;
    }
    if (pathname === "/api/health/") {
      if (!state.healthUp) {
        await route.abort("failed");
        return;
      }
      await route.fulfill(json({ status: "ok", service: "serverops-api" }));
      return;
    }
    if (pathname === "/api/metrics/") {
      if (state.metricsResult === "offline") {
        await route.abort("failed");
        return;
      }
      if (state.metricsResult === "error") {
        await route.fulfill(json(state.errorBody, state.errorStatus));
        return;
      }
      await route.fulfill(json(state.metrics));
      return;
    }
    if (pathname === "/api/analytics/history/") {
      if (!state.history) {
        await route.fallback();
        return;
      }
      const url = new URL(route.request().url());
      state.historyRequests?.push({
        metric: url.searchParams.get("metric"),
        range: url.searchParams.get("range"),
      });
      if (state.history === "unauthorized") {
        await route.fulfill(json({ detail: "Authentication credentials were not provided." }, 401));
        return;
      }
      if (state.history === "error") {
        await route.fulfill(json({ detail: "Prometheus is not reachable." }, 503));
        return;
      }
      const metric = url.searchParams.get("metric") ?? "";
      const range = url.searchParams.get("range") ?? "";
      if (state.history === "empty") {
        await route.fulfill(json(emptyHistory(metric, range)));
        return;
      }
      await route.fulfill(json(sampleHistory(metric, range)));
      return;
    }
    await route.fallback();
  });
}

const SAMPLE_TIME = 1_700_000_000;

function emptyHistory(metric: string, range: string) {
  return {
    metric,
    range,
    unit: metric === "http_requests" ? "requests_per_second" : "percent",
    step_seconds: 15,
    series: [],
  };
}

function sampleHistory(metric: string, range: string) {
  if (metric === "http_requests") {
    return {
      metric,
      range,
      unit: "requests_per_second",
      step_seconds: 15,
      series: [
        {
          label: "health",
          points: [
            { timestamp: SAMPLE_TIME, value: 0.2 },
            { timestamp: SAMPLE_TIME + 15, value: 0.4 },
          ],
        },
      ],
    };
  }
  const first = metric === "cpu" ? 12.5 : metric === "memory" ? 40.5 : 55;
  const second = metric === "cpu" ? 18 : first;
  return {
    metric,
    range,
    unit: "percent",
    step_seconds: 15,
    series: [
      {
        label: metric,
        points: [
          { timestamp: SAMPLE_TIME, value: first },
          { timestamp: SAMPLE_TIME + 15, value: second },
        ],
      },
    ],
  };
}
