export const MAX_API_TEST_REQUESTS = 200;
export const API_TEST_CONCURRENCY = 2;
export const API_TEST_MIN_START_GAP_MS = 100;

export const API_TEST_ENDPOINTS = [
  { id: "health", path: "/api/health/", label: "GET /api/health/" },
  { id: "metrics", path: "/api/metrics/", label: "GET /api/metrics/" },
] as const;

export type ApiTestEndpointId = (typeof API_TEST_ENDPOINTS)[number]["id"];

export interface ApiTestSnapshot {
  requested: number;
  started: number;
  completed: number;
  remaining: number;
  successful: number;
  failed: number;
  cancelled: number;
  networkErrors: number;
  statusCodes: Array<{ status: number; count: number }>;
  averageMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  elapsedMs: number;
  successRate: number | null;
  running: boolean;
}

interface Sample {
  kind: "success" | "http-error" | "network" | "cancelled";
  status: number | null;
  durationMs: number;
}

export function parseRequestCount(raw: string): { count: number } | { error: string } {
  const text = raw.trim();
  if (!/^[1-9]\d*$/.test(text)) {
    return { error: "Enter a whole number greater than zero." };
  }
  const count = Number(text);
  if (!Number.isSafeInteger(count)) {
    return { error: "Enter a whole number greater than zero." };
  }
  if (count > MAX_API_TEST_REQUESTS) {
    return { error: `Enter at most ${MAX_API_TEST_REQUESTS} requests.` };
  }
  return { count };
}

export function resolveApiTestEndpoint(id: string): (typeof API_TEST_ENDPOINTS)[number] | null {
  return API_TEST_ENDPOINTS.find((item) => item.id === id) ?? null;
}

export async function runBoundedGetTest(options: {
  path: string;
  count: number;
  signal: AbortSignal;
  onUpdate: (snapshot: ApiTestSnapshot) => void;
  onAuthStatus?: (status: 401 | 403) => void;
}): Promise<ApiTestSnapshot> {
  const { path, count, signal, onUpdate, onAuthStatus } = options;
  const samples: Array<Sample | undefined> = Array.from({ length: count }, () => undefined);
  let started = 0;
  let nextIndex = 0;
  let nextStartAt = 0;
  let chain: Promise<void> = Promise.resolve();
  let authReported = false;
  const wallStart = performance.now();

  const publish = (running: boolean) => {
    onUpdate(summarize(count, samples, started, performance.now() - wallStart, running));
  };

  const takeSlot = (): Promise<void> => {
    const turn = chain.then(async () => {
      const wait = nextStartAt - performance.now();
      if (wait > 0) {
        await sleep(wait, signal);
      }
      if (signal.aborted) {
        throw abortError();
      }
      nextStartAt = performance.now() + API_TEST_MIN_START_GAP_MS;
    });
    chain = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  };

  const worker = async () => {
    while (!signal.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= count) {
        return;
      }
      try {
        await takeSlot();
      } catch {
        samples[index] = { kind: "cancelled", status: null, durationMs: 0 };
        publish(true);
        return;
      }
      if (signal.aborted) {
        samples[index] = { kind: "cancelled", status: null, durationMs: 0 };
        publish(true);
        return;
      }
      started += 1;
      const startedAt = performance.now();
      try {
        const response = await fetch(path, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal,
        });
        await response.arrayBuffer();
        const durationMs = performance.now() - startedAt;
        const kind = response.ok ? "success" : "http-error";
        samples[index] = { kind, status: response.status, durationMs };
        publish(true);
        if (
          (response.status === 401 || response.status === 403) &&
          !authReported &&
          onAuthStatus
        ) {
          authReported = true;
          onAuthStatus(response.status);
        }
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          samples[index] = { kind: "cancelled", status: null, durationMs: 0 };
        } else {
          samples[index] = {
            kind: "network",
            status: null,
            durationMs: performance.now() - startedAt,
          };
        }
        publish(true);
      }
    }
  };

  publish(true);
  const workers = Math.min(API_TEST_CONCURRENCY, count);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  for (let index = 0; index < count; index += 1) {
    if (!samples[index]) {
      samples[index] = signal.aborted
        ? { kind: "cancelled", status: null, durationMs: 0 }
        : { kind: "network", status: null, durationMs: 0 };
    }
  }
  const finalSnapshot = summarize(
    count,
    samples,
    started,
    performance.now() - wallStart,
    false,
  );
  onUpdate(finalSnapshot);
  return finalSnapshot;
}

function summarize(
  requested: number,
  samples: Array<Sample | undefined>,
  started: number,
  elapsedMs: number,
  running: boolean,
): ApiTestSnapshot {
  let completed = 0;
  let successful = 0;
  let failed = 0;
  let cancelled = 0;
  let networkErrors = 0;
  const statuses = new Map<number, number>();
  const durations: number[] = [];

  for (const sample of samples) {
    if (!sample) {
      continue;
    }
    if (sample.kind === "cancelled") {
      cancelled += 1;
      continue;
    }
    if (sample.kind === "network") {
      failed += 1;
      networkErrors += 1;
      continue;
    }
    completed += 1;
    if (sample.status !== null) {
      statuses.set(sample.status, (statuses.get(sample.status) ?? 0) + 1);
    }
    durations.push(sample.durationMs);
    if (sample.kind === "success") {
      successful += 1;
    } else {
      failed += 1;
    }
  }

  const finished = successful + failed + cancelled;
  return {
    requested,
    started,
    completed,
    remaining: Math.max(0, requested - finished),
    successful,
    failed,
    cancelled,
    networkErrors,
    statusCodes: [...statuses.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([status, count]) => ({ status, count })),
    averageMs: durations.length ? mean(durations) : null,
    minMs: durations.length ? Math.min(...durations) : null,
    maxMs: durations.length ? Math.max(...durations) : null,
    elapsedMs,
    successRate: completed === 0 ? null : successful / completed,
    running,
  };
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): DOMException {
  return new DOMException("The test was cancelled.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
