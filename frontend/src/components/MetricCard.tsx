import type { ReactNode } from "react";
import { formatPercent } from "../utils/formatters.ts";

interface MetricDetail {
  label: string;
  value: string;
}

interface MetricCardProps {
  title: string;
  percent: number;
  icon: ReactNode;
  details: MetricDetail[];
  stale: boolean;
}

export function MetricCard({ title, percent, icon, details, stale }: MetricCardProps) {
  const width = Math.min(100, Math.max(0, percent));

  return (
    <article className="card">
      <div className="card-top">
        <div className="card-title">
          <span className="card-icon" aria-hidden="true">
            {icon}
          </span>
          <h2>{title}</h2>
        </div>
        {stale ? <span className="stale-badge">Stale</span> : null}
      </div>
      <p className="metric-value">{formatPercent(percent)}</p>
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
        aria-valuetext={formatPercent(percent)}
        aria-label={`${title} utilization`}
      >
        <div className="bar-fill" style={{ width: `${width}%` }} />
      </div>
      <dl className="details">
        {details.map((detail) => (
          <div key={detail.label}>
            <dt>{detail.label}</dt>
            <dd>{detail.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
