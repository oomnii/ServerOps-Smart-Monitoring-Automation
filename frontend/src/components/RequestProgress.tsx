import type { ApiTestSnapshot } from "../testing/runApiTest.ts";

interface RequestProgressProps {
  snapshot: ApiTestSnapshot;
}

export function RequestProgress({ snapshot }: RequestProgressProps) {
  const finished = snapshot.successful + snapshot.failed + snapshot.cancelled;
  const width = snapshot.requested === 0 ? 0 : (finished / snapshot.requested) * 100;

  return (
    <div className="request-progress">
      <div
        className="bar"
        role="progressbar"
        aria-label="Request progress"
        aria-valuemin={0}
        aria-valuemax={snapshot.requested}
        aria-valuenow={finished}
      >
        <div className="bar-fill" style={{ width: `${width}%` }} />
      </div>
      <dl className="result-grid">
        <Result label="Requested count" value={String(snapshot.requested)} />
        <Result label="Requests started" value={String(snapshot.started)} />
        <Result label="Requests completed" value={String(snapshot.completed)} />
        <Result label="Requests remaining" value={String(snapshot.remaining)} />
        <Result label="Successful responses" value={String(snapshot.successful)} />
        <Result label="Failed responses" value={String(snapshot.failed)} />
        <Result label="Cancelled requests" value={String(snapshot.cancelled)} />
      </dl>
    </div>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-progress={label}>{value}</dd>
    </div>
  );
}
