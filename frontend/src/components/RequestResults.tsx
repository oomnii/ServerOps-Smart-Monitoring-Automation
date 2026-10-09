import type { ApiTestSnapshot } from "../testing/runApiTest.ts";

interface RequestResultsProps {
  snapshot: ApiTestSnapshot;
}

export function RequestResults({ snapshot }: RequestResultsProps) {
  const statusText = snapshot.statusCodes.length
    ? snapshot.statusCodes.map((item) => `${item.status}: ${item.count}`).join(", ")
    : "None";

  return (
    <section className="test-results" aria-label="Test results">
      <h2>Test results</h2>
      <dl className="result-grid">
        <Result label="Total Requested" value={String(snapshot.requested)} />
        <Result label="Completed Requests" value={String(snapshot.completed)} />
        <Result label="Successful Requests" value={String(snapshot.successful)} />
        <Result label="Failed Requests" value={String(snapshot.failed)} />
        <Result label="HTTP Status Codes" value={statusText} />
        <Result label="Average Response Time" value={latency(snapshot.averageMs)} />
        <Result label="Minimum Response Time" value={latency(snapshot.minMs)} />
        <Result label="Maximum Response Time" value={latency(snapshot.maxMs)} />
        <Result label="Total Execution Time" value={latency(snapshot.elapsedMs)} />
        <Result label="Success Rate" value={rate(snapshot.successRate)} />
      </dl>
      {snapshot.networkErrors > 0 ? (
        <p className="note">
          {snapshot.networkErrors} request{snapshot.networkErrors === 1 ? "" : "s"} failed before an
          HTTP status was received.
        </p>
      ) : null}
      <p className="note">
        These times include browser and network overhead. They are not pure server processing times.
      </p>
    </section>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-result={label}>{value}</dd>
    </div>
  );
}

function latency(value: number | null): string {
  if (value === null) {
    return "Unavailable";
  }
  return `${value.toFixed(1)} ms`;
}

function rate(value: number | null): string {
  if (value === null) {
    return "Unavailable";
  }
  return `${(value * 100).toFixed(1)}%`;
}
