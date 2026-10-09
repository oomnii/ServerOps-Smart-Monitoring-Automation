export const CPU_ALERT_THRESHOLD = 80;
export const MEMORY_ALERT_THRESHOLD = 80;

export interface ResourceAlert {
  id: "cpu" | "memory";
  title: string;
  detail: string;
  percent: number;
  threshold: number;
}

export function buildResourceAlerts(
  input: { cpuPercent: number; memoryPercent: number } | null,
  stale: boolean,
): ResourceAlert[] {
  if (!input || stale) {
    return [];
  }

  const alerts: ResourceAlert[] = [];
  if (input.cpuPercent >= CPU_ALERT_THRESHOLD) {
    alerts.push({
      id: "cpu",
      title: "High CPU Usage",
      detail: `CPU utilization has reached ${input.cpuPercent.toFixed(1)}%.`,
      percent: input.cpuPercent,
      threshold: CPU_ALERT_THRESHOLD,
    });
  }
  if (input.memoryPercent >= MEMORY_ALERT_THRESHOLD) {
    alerts.push({
      id: "memory",
      title: "High Memory Usage",
      detail: `Memory utilization has reached ${input.memoryPercent.toFixed(1)}%.`,
      percent: input.memoryPercent,
      threshold: MEMORY_ALERT_THRESHOLD,
    });
  }
  return alerts;
}
