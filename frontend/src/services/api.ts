import type {
  HistoryMetric,
  HistoryPoint,
  HistoryRange,
  HistoryResponse,
  HistorySeries,
  HistoryUnit,
} from "../types/analytics.ts";
import type {
  CpuMetrics,
  DiskMetrics,
  HealthResponse,
  MemoryMetrics,
  SystemMetrics,
} from "../types/metrics.ts";

const REQUEST_TIMEOUT_MS = 8000;
const UNREACHABLE = "The monitoring API is not reachable. Start Django on 127.0.0.1:8000.";

export interface SessionUser {
  authenticated: true;
  username: string;
}

export class ApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured !== "string") {
    return "";
  }
  return configured.trim().replace(/\/+$/, "");
}

export async function getHealth(signal: AbortSignal): Promise<HealthResponse> {
  const payload = await requestJson("/api/health/", signal);
  return parseHealth(payload);
}

export async function getSystemMetrics(signal: AbortSignal): Promise<SystemMetrics> {
  const payload = await requestJson("/api/metrics/", signal);
  return parseSystemMetrics(payload);
}

export async function getMetricHistory(
  metric: HistoryMetric,
  range: HistoryRange,
  signal: AbortSignal,
): Promise<HistoryResponse> {
  const payload = await requestJson(
    `/api/analytics/history/?metric=${metric}&range=${range}`,
    signal,
  );
  return parseHistory(payload, metric, range);
}

export async function getSession(signal: AbortSignal): Promise<SessionUser> {
  const payload = await requestJson("/api/auth/me/", signal);
  return parseSession(payload);
}

export async function login(
  username: string,
  password: string,
  signal: AbortSignal,
): Promise<SessionUser> {
  await requestJson("/api/auth/csrf/", signal);
  const payload = await requestJson("/api/auth/login/", signal, {
    method: "POST",
    body: { username, password },
  });
  return parseSession(payload);
}

export async function logout(signal: AbortSignal): Promise<void> {
  await requestJson("/api/auth/csrf/", signal);
  const payload = await requestJson("/api/auth/logout/", signal, { method: "POST" });
  if (!isRecord(payload) || payload.success !== true) {
    throw new ApiError("The server did not confirm that the session ended.");
  }
}

async function requestJson(
  path: string,
  signal: AbortSignal,
  options?: { method?: "GET" | "POST"; body?: unknown },
): Promise<unknown> {
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method === "POST") {
    const token = readCsrfToken();
    if (!token) {
      throw new ApiError("The security token is missing. Reload the page and try again.", 403);
    }
    headers["Content-Type"] = "application/json";
    headers["X-CSRFToken"] = token;
  }

  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const abortTimeout = () => timeout.abort();
  signal.addEventListener("abort", abortTimeout);

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: method === "POST" ? JSON.stringify(options?.body ?? {}) : undefined,
      signal: timeout.signal,
    });

    if (!response.ok) {
      if (response.status === 502 || response.status === 504) {
        throw new ApiError(UNREACHABLE, response.status);
      }
      const message = await readErrorMessage(response);
      if (response.status >= 500 && message.startsWith("The monitoring API returned HTTP")) {
        throw new ApiError(UNREACHABLE, response.status);
      }
      throw new ApiError(message, response.status);
    }

    try {
      return await response.json();
    } catch {
      throw new ApiError("The monitoring API returned an unreadable response.");
    }
  } catch (error) {
    if (isAbortError(error) && signal.aborted) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ApiError("The monitoring API took too long to respond.");
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(UNREACHABLE);
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", abortTimeout);
  }
}

function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  if (!match?.[1]) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

function parseSession(payload: unknown): SessionUser {
  if (
    !isRecord(payload) ||
    payload.authenticated !== true ||
    typeof payload.username !== "string" ||
    payload.username.trim() === ""
  ) {
    throw new ApiError("The server returned an unexpected sign-in response.");
  }
  return { authenticated: true, username: payload.username };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload)) {
      const detail = safeText(payload.detail) ?? safeText(payload.error);
      if (detail) {
        return detail;
      }
    }
  } catch {
    // The body was not JSON. Fall through to the status message.
  }
  return `The monitoring API returned HTTP ${response.status}.`;
}

function parseHealth(payload: unknown): HealthResponse {
  if (
    !isRecord(payload) ||
    payload.status !== "ok" ||
    payload.service !== "serverops-api"
  ) {
    throw new ApiError("The API health check did not report a healthy service.");
  }
  return { status: "ok", service: "serverops-api" };
}

function parseSystemMetrics(payload: unknown): SystemMetrics {
  if (!isRecord(payload)) {
    throw new ApiError("The metrics response was not a JSON object.");
  }

  return {
    timestamp_utc: readTimestamp(payload.timestamp_utc),
    cpu: parseCpu(payload.cpu),
    memory: parseMemory(payload.memory),
    disk: parseDisk(payload.disk),
  };
}

function parseCpu(payload: unknown): CpuMetrics {
  if (!isRecord(payload)) {
    throw new ApiError("CPU metrics were missing from the API response.");
  }
  return {
    cpu_percent: readPercent(payload.cpu_percent, "CPU percentage"),
    logical_cores: readCoreCount(payload.logical_cores),
  };
}

function parseMemory(payload: unknown): MemoryMetrics {
  if (!isRecord(payload)) {
    throw new ApiError("Memory metrics were missing from the API response.");
  }
  const totalBytes = readBytes(payload.total_bytes, "total memory", false);
  const usedBytes = readBytes(payload.used_bytes, "used memory", true);
  const availableBytes = readBytes(payload.available_bytes, "available memory", true);
  if (usedBytes > totalBytes || availableBytes > totalBytes) {
    throw new ApiError("Memory metrics from the API were inconsistent.");
  }
  return {
    total_bytes: totalBytes,
    used_bytes: usedBytes,
    available_bytes: availableBytes,
    memory_percent: readPercent(payload.memory_percent, "memory percentage"),
  };
}

function parseDisk(payload: unknown): DiskMetrics {
  if (!isRecord(payload)) {
    throw new ApiError("Disk metrics were missing from the API response.");
  }
  const totalBytes = readBytes(payload.total_bytes, "total disk space", false);
  const usedBytes = readBytes(payload.used_bytes, "used disk space", true);
  const freeBytes = readBytes(payload.free_bytes, "free disk space", true);
  if (usedBytes > totalBytes || freeBytes > totalBytes) {
    throw new ApiError("Disk metrics from the API were inconsistent.");
  }
  return {
    total_bytes: totalBytes,
    used_bytes: usedBytes,
    free_bytes: freeBytes,
    disk_percent: readPercent(payload.disk_percent, "disk percentage"),
  };
}

function readPercent(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ApiError(`The API returned an invalid ${label}.`);
  }
  return value;
}

function readBytes(value: unknown, label: string, allowZero: boolean): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (!allowZero && value === 0)
  ) {
    throw new ApiError(`The API returned an invalid ${label}.`);
  }
  return value;
}

function readCoreCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ApiError("The API returned an invalid CPU core count.");
  }
  return value;
}

function readTimestamp(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new ApiError("The metrics timestamp from the API was invalid.");
  }
  return value;
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (!text || text.length > 180 || text.includes("\\") || text.includes("Traceback")) {
    return null;
  }
  return text;
}

function parseHistory(
  payload: unknown,
  metric: HistoryMetric,
  range: HistoryRange,
): HistoryResponse {
  if (!isRecord(payload)) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  const unit: HistoryUnit = metric === "http_requests" ? "requests_per_second" : "percent";
  if (payload.metric !== metric || payload.range !== range || payload.unit !== unit) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  if (
    typeof payload.step_seconds !== "number" ||
    !Number.isInteger(payload.step_seconds) ||
    payload.step_seconds < 1 ||
    payload.step_seconds > 300
  ) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  if (!Array.isArray(payload.series)) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  return {
    metric,
    range,
    unit,
    step_seconds: payload.step_seconds,
    series: payload.series.map((item) => parseHistorySeries(item, unit)),
  };
}

function parseHistorySeries(payload: unknown, unit: HistoryUnit): HistorySeries {
  if (!isRecord(payload) || typeof payload.label !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(payload.label)) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  if (!Array.isArray(payload.points)) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  const points = payload.points.map((point) => parseHistoryPoint(point, unit));
  points.sort((left, right) => left.timestamp - right.timestamp);
  return { label: payload.label, points };
}

function parseHistoryPoint(payload: unknown, unit: HistoryUnit): HistoryPoint {
  if (!isRecord(payload)) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  const timestamp = payload.timestamp;
  const value = payload.value;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  if (unit === "percent" && value > 100) {
    throw new ApiError("The analytics API returned an unexpected response.");
  }
  return { timestamp, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
