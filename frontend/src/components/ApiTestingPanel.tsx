import { useEffect, useRef, useState } from "react";
import {
  API_TEST_ENDPOINTS,
  MAX_API_TEST_REQUESTS,
  parseRequestCount,
  resolveApiTestEndpoint,
  runBoundedGetTest,
  type ApiTestSnapshot,
} from "../testing/runApiTest.ts";
import { RequestProgress } from "./RequestProgress.tsx";
import { RequestResults } from "./RequestResults.tsx";

interface ApiTestingPanelProps {
  loggingOut: boolean;
  onAuthFailure: (status: 401 | 403) => void;
}

export function ApiTestingPanel({ loggingOut, onAuthFailure }: ApiTestingPanelProps) {
  const [endpointId, setEndpointId] = useState<(typeof API_TEST_ENDPOINTS)[number]["id"]>("health");
  const [countText, setCountText] = useState("10");
  const [formError, setFormError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [snapshot, setSnapshot] = useState<ApiTestSnapshot | null>(null);
  const runController = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const activeRef = useRef(true);
  const onAuthFailureRef = useRef(onAuthFailure);

  useEffect(() => {
    onAuthFailureRef.current = onAuthFailure;
  }, [onAuthFailure]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      runController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (loggingOut) {
      runController.current?.abort();
    }
  }, [loggingOut]);

  function start() {
    if (runningRef.current || loggingOut) {
      return;
    }
    const parsed = parseRequestCount(countText);
    if ("error" in parsed) {
      setFormError(parsed.error);
      return;
    }
    const endpoint = resolveApiTestEndpoint(endpointId);
    if (!endpoint) {
      setFormError("Choose an allowed endpoint.");
      return;
    }
    runningRef.current = true;
    setRunning(true);
    setFormError(null);
    const controller = new AbortController();
    runController.current = controller;
    void runBoundedGetTest({
      path: endpoint.path,
      count: parsed.count,
      signal: controller.signal,
      onUpdate: (next) => {
        if (activeRef.current) {
          setSnapshot(next);
        }
      },
      onAuthStatus: (status) => {
        controller.abort();
        onAuthFailureRef.current(status);
      },
    }).finally(() => {
      runningRef.current = false;
      if (runController.current === controller) {
        runController.current = null;
      }
      if (activeRef.current) {
        setRunning(false);
      }
    });
  }

  return (
    <section className="test-panel" aria-label="Manual API Testing">
      <h2>Manual API Testing</h2>
      <p className="lede">
        Send GET requests to this ServerOps API and measure the responses in the browser.
        At most {MAX_API_TEST_REQUESTS} requests run, two at a time, with at least 100 ms between
        starts.
      </p>
      <form
        className="test-controls"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <label>
          Endpoint
          <select
            value={endpointId}
            disabled={running || loggingOut}
            onChange={(event) => {
              const next = resolveApiTestEndpoint(event.target.value);
              if (next) {
                setEndpointId(next.id);
              }
            }}
          >
            {API_TEST_ENDPOINTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Number of Requests
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_API_TEST_REQUESTS}
            step={1}
            value={countText}
            disabled={running || loggingOut}
            onChange={(event) => setCountText(event.target.value)}
          />
        </label>
        <button type="submit" className="refresh" disabled={running || loggingOut}>
          Send Requests
        </button>
        <button
          type="button"
          className="logout"
          onClick={() => runController.current?.abort()}
          disabled={!running}
        >
          Cancel Test
        </button>
      </form>
      {formError ? (
        <p className="banner" role="alert">
          {formError}
        </p>
      ) : null}
      {snapshot ? <RequestProgress snapshot={snapshot} /> : null}
      {snapshot && !snapshot.running ? <RequestResults snapshot={snapshot} /> : null}
    </section>
  );
}
