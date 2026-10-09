import { useEffect, useRef, useState } from "react";
import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import { ApiError, getHealth, getSystemMetrics } from "../services/api.ts";
import type { SystemMetrics } from "../types/metrics.ts";
import { buildResourceAlerts } from "../utils/alerts.ts";
import { formatBytes, formatTimestamp } from "../utils/formatters.ts";
import { AlertList } from "./AlertList.tsx";
import { Header } from "./Header.tsx";
import { MetricCard } from "./MetricCard.tsx";

const POLL_INTERVAL_MS = 5000;

type ConnectionStatus = "loading" | "online" | "offline";

interface DashboardProps {
  username: string;
  loggingOut: boolean;
  logoutError: string | null;
  onLogout: () => void;
  onAuthFailure: (status: 401 | 403) => void;
}

export function Dashboard({
  username,
  loggingOut,
  logoutError,
  onLogout,
  onAuthFailure,
}: DashboardProps) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [stale, setStale] = useState(false);
  const metricsRef = useRef<SystemMetrics | null>(null);
  const inFlight = useRef(false);
  const requestId = useRef(0);
  const tickRef = useRef<() => void>(() => {});
  const onAuthFailureRef = useRef(onAuthFailure);

  useEffect(() => {
    onAuthFailureRef.current = onAuthFailure;
  }, [onAuthFailure]);

  useEffect(() => {
    let stopped = false;
    let active = false;
    let timer = 0;
    const controllerRef: { current: AbortController | null } = { current: null };

    const schedule = () => {
      if (stopped) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setRefreshing(true);
        tick();
      }, POLL_INTERVAL_MS);
    };

    const tick = () => {
      if (stopped || active) {
        return;
      }
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const id = requestId.current + 1;
      requestId.current = id;
      active = true;
      inFlight.current = true;

      void loadSnapshot(controller.signal)
        .then((result) => {
          if (stopped || id !== requestId.current) {
            return;
          }
          if (result.authStatus === 401 || result.authStatus === 403) {
            stopped = true;
            window.clearTimeout(timer);
            metricsRef.current = null;
            setMetrics(null);
            setError(null);
            onAuthFailureRef.current(result.authStatus);
            return;
          }
          applyResult(result, metricsRef, setMetrics, setConnection, setError, setStale);
        })
        .catch(() => {
          if (stopped || id !== requestId.current) {
            return;
          }
          setConnection("offline");
          setError("The monitoring API could not be reached.");
          setStale(metricsRef.current !== null);
        })
        .finally(() => {
          if (id !== requestId.current) {
            return;
          }
          active = false;
          inFlight.current = false;
          setRefreshing(false);
          if (!stopped) {
            schedule();
          }
        });
    };

    tickRef.current = () => {
      if (stopped || active) {
        return;
      }
      window.clearTimeout(timer);
      tick();
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped || active) {
        return;
      }
      window.clearTimeout(timer);
      setRefreshing(true);
      tick();
    };

    document.addEventListener("visibilitychange", onVisible);
    tick();

    return () => {
      stopped = true;
      active = false;
      inFlight.current = false;
      requestId.current += 1;
      tickRef.current = () => {};
      window.clearTimeout(timer);
      controllerRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function onRefresh() {
    if (inFlight.current || loggingOut) {
      return;
    }
    setRefreshing(true);
    tickRef.current();
  }

  const alerts = buildResourceAlerts(
    metrics
      ? {
          cpuPercent: metrics.cpu.cpu_percent,
          memoryPercent: metrics.memory.memory_percent,
        }
      : null,
    stale,
  );

  return (
    <div className="page">
      <Header
        status={connection}
        refreshing={refreshing}
        username={username}
        loggingOut={loggingOut}
        onRefresh={onRefresh}
        onLogout={onLogout}
      />
      <main id="main" className="content">
        <p className="lede">
          Live CPU, memory, and disk readings from this computer, collected by the
          local Django API. API online means the backend answered its health check.
          It does not mean the computer itself is healthy. Readings refresh every 5
          seconds while you stay signed in.
        </p>

        {logoutError ? (
          <p className="banner" role="alert">
            {logoutError}
          </p>
        ) : null}
        {error ? (
          <p className="banner" role="alert">
            {error}
          </p>
        ) : null}

        <AlertList alerts={alerts} stale={stale} hasMetrics={metrics !== null} />

        <div className="meta">
          <p>
            <span className="meta-label">Last successful metrics update</span>
            {metrics ? (
              <time dateTime={metrics.timestamp_utc}>
                {formatTimestamp(metrics.timestamp_utc)}
                {stale ? " (stale)" : ""}
              </time>
            ) : (
              <span>None yet</span>
            )}
          </p>
          {refreshing ? <p role="status">Refreshing metrics.</p> : null}
        </div>

        {metrics ? (
          <section className="cards" aria-label="System metrics" aria-busy={refreshing}>
            <MetricCard
              title="CPU usage"
              percent={metrics.cpu.cpu_percent}
              icon={<Cpu />}
              stale={stale}
              details={[
                { label: "Logical cores", value: String(metrics.cpu.logical_cores) },
              ]}
            />
            <MetricCard
              title="Memory usage"
              percent={metrics.memory.memory_percent}
              icon={<MemoryStick />}
              stale={stale}
              details={[
                { label: "Used", value: formatBytes(metrics.memory.used_bytes) },
                { label: "Total", value: formatBytes(metrics.memory.total_bytes) },
                { label: "Available", value: formatBytes(metrics.memory.available_bytes) },
              ]}
            />
            <MetricCard
              title="Disk usage"
              percent={metrics.disk.disk_percent}
              icon={<HardDrive />}
              stale={stale}
              details={[
                { label: "Used", value: formatBytes(metrics.disk.used_bytes) },
                { label: "Total", value: formatBytes(metrics.disk.total_bytes) },
                { label: "Free", value: formatBytes(metrics.disk.free_bytes) },
              ]}
            />
          </section>
        ) : error ? (
          <section className="empty" aria-label="Metrics unavailable">
            <h2>Metrics unavailable</h2>
            <p>No readings are available until the API returns a valid snapshot.</p>
          </section>
        ) : (
          <section className="cards" aria-label="Loading system metrics" aria-busy="true">
            <p className="visually-hidden" role="status">
              Loading system metrics.
            </p>
            <article className="card skeleton" aria-hidden="true" />
            <article className="card skeleton" aria-hidden="true" />
            <article className="card skeleton" aria-hidden="true" />
          </section>
        )}
      </main>
    </div>
  );
}

interface SnapshotResult {
  healthError: string | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  aborted: boolean;
  authStatus: 401 | 403 | null;
}

async function loadSnapshot(signal: AbortSignal): Promise<SnapshotResult> {
  const empty: SnapshotResult = {
    healthError: null,
    metrics: null,
    metricsError: null,
    aborted: true,
    authStatus: null,
  };
  const [healthOutcome, metricsOutcome] = await Promise.allSettled([
    getHealth(signal),
    getSystemMetrics(signal),
  ]);

  const healthAborted = healthOutcome.status === "rejected" && isAbort(healthOutcome.reason);
  const metricsAborted = metricsOutcome.status === "rejected" && isAbort(metricsOutcome.reason);
  if (signal.aborted || healthAborted || metricsAborted) {
    return empty;
  }

  const authStatus =
    metricsOutcome.status === "rejected" ? authStatusFrom(metricsOutcome.reason) : null;
  if (authStatus) {
    return { ...empty, aborted: false, authStatus };
  }

  return {
    healthError:
      healthOutcome.status === "fulfilled" ? null : messageFrom(healthOutcome.reason),
    metrics: metricsOutcome.status === "fulfilled" ? metricsOutcome.value : null,
    metricsError:
      metricsOutcome.status === "fulfilled" ? null : messageFrom(metricsOutcome.reason),
    aborted: false,
    authStatus: null,
  };
}

function applyResult(
  result: SnapshotResult,
  metricsRef: { current: SystemMetrics | null },
  setMetrics: (value: SystemMetrics | null) => void,
  setConnection: (value: ConnectionStatus) => void,
  setError: (value: string | null) => void,
  setStale: (value: boolean) => void,
) {
  if (result.aborted) {
    return;
  }

  if (result.healthError) {
    setConnection("offline");
  } else {
    setConnection("online");
  }

  if (result.metrics) {
    metricsRef.current = result.metrics;
    setMetrics(result.metrics);
    setStale(false);
  } else if (result.metricsError) {
    setStale(metricsRef.current !== null);
  }

  if (result.metricsError) {
    setError(result.metricsError);
    return;
  }
  if (result.healthError) {
    setError(result.healthError);
    return;
  }
  setError(null);
}

function authStatusFrom(error: unknown): 401 | 403 | null {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return error.status;
  }
  return null;
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "The monitoring API could not be reached.";
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
