import { expect, test } from "@playwright/test";
import { readE2EAccount } from "./account.ts";

test("login form is shown to a signed-out visitor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  const password = page.getByLabel("Password");
  await expect(password).toBeVisible();
  await expect(password).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  const metrics = await page.request.get("/api/metrics/");
  expect(metrics.status()).toBe(401);
});

test("invalid credentials stay on the sign-in form", async ({ page }) => {
  const account = readE2EAccount();
  await page.goto("/");
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid username or password.");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect((await page.request.get("/api/auth/me/")).status()).toBe(401);
});

test("keyboard sign-in reaches the live dashboard", async ({ page }) => {
  const account = readE2EAccount();
  await page.goto("/");
  await page.getByLabel("Username").focus();
  await page.keyboard.type(account.username);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.type(account.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Smart Server Monitoring Dashboard" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${account.username}`)).toBeVisible();
  await expect(page.getByText("API online", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/metrics/")).status()).toBe(200);
});

test("session survives reload and logout invalidates it", async ({ page }) => {
  const account = readE2EAccount();
  const metricsRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/metrics/") {
      metricsRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "CPU usage" })).toBeVisible();
  const beforeReload = metricsRequests.length;
  expect(beforeReload).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "CPU usage" })).toBeVisible();
  await expect.poll(() => metricsRequests.length).toBeGreaterThan(beforeReload);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CPU usage" })).toHaveCount(0);
  expect((await page.request.get("/api/metrics/")).status()).toBe(401);
  expect((await page.request.get("/api/auth/me/")).status()).toBe(401);

  const afterLogout = metricsRequests.length;
  await page.waitForTimeout(6000);
  expect(metricsRequests.length).toBe(afterLogout);
});
