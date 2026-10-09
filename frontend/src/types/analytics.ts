export const HISTORY_METRICS = ["cpu", "memory", "disk", "http_requests"] as const;
export const HISTORY_RANGES = ["15m", "1h", "6h", "24h"] as const;

export type HistoryMetric = (typeof HISTORY_METRICS)[number];
export type HistoryRange = (typeof HISTORY_RANGES)[number];
export type HistoryUnit = "percent" | "requests_per_second";

export interface HistoryPoint {
  timestamp: number;
  value: number;
}

export interface HistorySeries {
  label: string;
  points: HistoryPoint[];
}

export interface HistoryResponse {
  metric: HistoryMetric;
  range: HistoryRange;
  unit: HistoryUnit;
  step_seconds: number;
  series: HistorySeries[];
}

export interface HistoryBundle {
  cpu: HistoryResponse;
  memory: HistoryResponse;
  disk: HistoryResponse;
  http_requests: HistoryResponse;
}
