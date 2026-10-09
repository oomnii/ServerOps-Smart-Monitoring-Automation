import { TriangleAlert } from "lucide-react";
import type { ResourceAlert } from "../utils/alerts.ts";

interface AlertListProps {
  alerts: ResourceAlert[];
  stale: boolean;
  hasMetrics: boolean;
}

export function AlertList({ alerts, stale, hasMetrics }: AlertListProps) {
  if (!hasMetrics) {
    return null;
  }

  if (stale) {
    return (
      <section className="alerts" aria-label="Resource alerts">
        <p>Resource alerts are hidden until a fresh reading arrives.</p>
      </section>
    );
  }

  if (alerts.length === 0) {
    return (
      <section className="alerts" aria-label="Resource alerts">
        <p>No resource alerts. CPU and memory are below 80%.</p>
      </section>
    );
  }

  return (
    <section className="alerts" aria-label="Resource alerts">
      {alerts.map((alert) => (
        <article key={alert.id} className="alert-card">
          <TriangleAlert aria-hidden="true" />
          <div>
            <h2>{alert.title}</h2>
            <p>{alert.detail}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
