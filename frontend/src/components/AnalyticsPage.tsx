import { useEffect, useRef, useState } from "react";
import { ApiError, getMetricHistory } from "../services/api.ts";
import type { HistoryBundle, HistoryRange, HistorySeries } from "../types/analytics.ts";
import { AnalyticsChart } from "./AnalyticsChart.tsx";
import { ApiTestingPanel } from "./ApiTestingPanel.tsx";
import { Header } from "./Header.tsx";
import { TimeRangeSelector } from "./TimeRangeSelector.tsx";

const POLL_INTERVAL_MS = 10_000;

const HTTP_NOTE =
  "This graph uses Prometheus rate() over one minute. A burst of requests is spread across that window, so 100 requests do not appear as 100 requests per second. New traffic shows up after Prometheus scrapes Django.";

interface AnalyticsPageProps {
  username: string;
  loggingOut: boolean;
  logoutError: string | null;
  onLogout: () => void;
  onAuthFailure: (status: 401 | 403) => void;
}

export function AnalyticsPage({
  username,
  loggingOut,
  logoutError,
  onLogout,
  onAuthFailure,
}: AnalyticsPageProps) {
  const [range, setRange] = useState<HistoryRange>("15m");
  const [bundle, setBundle] = useState<HistoryBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataRange, setDataRange] = useState<HistoryRange | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const onAuthFailureRef = useRef(onAuthFailure);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    onAuthFailureRef.current = onAuthFailure;
  }, [onAuthFailure]);

  useEffect(() => {
    if (loggingOut) {
      return undefined;
    }
    let stopped = false;
    let timer = 0;
    let inFlight = false;
    let controller: AbortController | null = null;
    let generation = 0;

    const load = async () => {
      if (stopped || inFlight) {
        return;
      }
      inFlight = true;
      generation += 1;
      const current = generation;
      controller?.abort();
      const active = new AbortController();
      controller = active;
      let authEnded = false;
      setRefreshing(true);
      try {
        const [cpu, memory, disk, httpRequests] = await Promise.all([
          getMetricHistory("cpu", range, active.signal),
          getMetricHistory("memory", range, active.signal),
          getMetricHistory("disk", range, active.signal),
          getMetricHistory("http_requests", range, active.signal),
        ]);
        if (stopped || current !== generation) {
          return;
        }
        setBundle({ cpu, memory, disk, http_requests: httpRequests });
        setError(null);
        setDataRange(range);
      } catch (caught) {
        if (stopped || isAbort(caught) || current !== generation) {
          return;
        }
        if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
          authEnded = true;
          onAuthFailureRef.current(caught.status);
          return;
        }
        setBundle(null);
        setError(caught instanceof ApiError ? caught.message : "Prometheus is not reachable.");
        setDataRange(range);
      } finally {
        inFlight = false;
        if (!stopped && !authEnded && current === generation) {
          setRefreshing(false);
          timer = window.setTimeout(() => {
            void load();
          }, POLL_INTERVAL_MS);
        }
      }
    };

    refreshRef.current = () => {
      if (inFlight) {
        return;
      }
      window.clearTimeout(timer);
      void load();
    };

    void load();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [range, loggingOut]);

  const shownBundle = dataRange === range ? bundle : null;
  const shownError = dataRange === range ? error : null;
  const prometheus = shownError ? "offline" : shownBundle ? "online" : "loading";

  return (
    <div className="page">
      <Header
        title="Analytics & API Testing"
        statusLabel="Prometheus"
        status={prometheus}
        refreshing={refreshing}
        username={username}
        loggingOut={loggingOut}
        onRefresh={() => refreshRef.current()}
        onLogout={onLogout}
      />
      <main id="main" className="content">
        <p className="lede">
          Historical CPU, memory, disk, and Django request-rate samples from Prometheus.
          The browser does not query Prometheus directly.
        </p>
        {logoutError ? (
          <p className="banner" role="alert">
            {logoutError}
          </p>
        ) : null}
        <div className="analytics-toolbar">
          <TimeRangeSelector
            value={range}
            disabled={loggingOut}
            onChange={(next) => {
              setRefreshing(true);
              setRange(next);
            }}
          />
        </div>
        {shownError ? (
          <div className="banner" role="alert">
            <p>{shownError}</p>
            <button type="button" className="retry" onClick={() => refreshRef.current()} disabled={refreshing}>
              Retry
            </button>
          </div>
        ) : null}
        <div className="chart-grid">
          <AnalyticsChart
            title="CPU Usage"
            unit="percent"
            range={range}
            stepSeconds={shownBundle?.cpu.step_seconds ?? 15}
            series={shownBundle?.cpu.series ?? []}
            status={chartStatus(shownBundle, shownError, shownBundle?.cpu.series)}
          />
          <AnalyticsChart
            title="Memory Usage"
            unit="percent"
            range={range}
            stepSeconds={shownBundle?.memory.step_seconds ?? 15}
            series={shownBundle?.memory.series ?? []}
            status={chartStatus(shownBundle, shownError, shownBundle?.memory.series)}
          />
          <AnalyticsChart
            title="Disk Usage"
            unit="percent"
            range={range}
            stepSeconds={shownBundle?.disk.step_seconds ?? 15}
            series={shownBundle?.disk.series ?? []}
            status={chartStatus(shownBundle, shownError, shownBundle?.disk.series)}
          />
          <AnalyticsChart
            title="Django HTTP Requests"
            unit="requests_per_second"
            range={range}
            stepSeconds={shownBundle?.http_requests.step_seconds ?? 15}
            series={shownBundle?.http_requests.series ?? []}
            status={chartStatus(shownBundle, shownError, shownBundle?.http_requests.series)}
            note={HTTP_NOTE}
          />
        </div>
        <ApiTestingPanel loggingOut={loggingOut} onAuthFailure={onAuthFailure} />
      </main>
    </div>
  );
}

function chartStatus(
  bundle: HistoryBundle | null,
  error: string | null,
  series: HistorySeries[] | undefined,
): "loading" | "ready" | "empty" | "error" {
  if (error) {
    return "error";
  }
  if (!bundle || !series) {
    return "loading";
  }
  if (!series.some((item) => item.points.length > 0)) {
    return "empty";
  }
  return "ready";
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
