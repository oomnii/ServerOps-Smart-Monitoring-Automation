import { expect, type Page } from "@playwright/test";
import { json, type FixtureMetrics } from "./metrics.ts";

export interface MockState {
  me: "in" | "out" | "forbidden";
  healthUp: boolean;
  metrics: FixtureMetrics;
  metricsResult: "ok" | "offline" | "error";
  errorStatus: number;
  errorBody: unknown;
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
    await route.fallback();
  });
}
