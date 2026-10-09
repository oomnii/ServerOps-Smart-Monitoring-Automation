export interface FixtureMetrics {
  timestamp_utc: string;
  cpu: { cpu_percent: number; logical_cores: number };
  memory: {
    total_bytes: number;
    used_bytes: number;
    available_bytes: number;
    memory_percent: number;
  };
  disk: {
    total_bytes: number;
    used_bytes: number;
    free_bytes: number;
    disk_percent: number;
  };
}

const TOTAL = 8_000_000_000;

export function metrics(options: {
  cpu?: number;
  memory?: number;
  disk?: number;
  timestamp?: string;
  cores?: number;
}): FixtureMetrics {
  const cpu = options.cpu ?? 12.5;
  const memory = options.memory ?? 40;
  const disk = options.disk ?? 25;
  return {
    timestamp_utc: options.timestamp ?? "2026-10-09T08:00:00Z",
    cpu: { cpu_percent: cpu, logical_cores: options.cores ?? 8 },
    memory: {
      total_bytes: TOTAL,
      used_bytes: Math.round((TOTAL * memory) / 100),
      available_bytes: TOTAL - Math.round((TOTAL * memory) / 100),
      memory_percent: memory,
    },
    disk: {
      total_bytes: TOTAL,
      used_bytes: Math.round((TOTAL * disk) / 100),
      free_bytes: TOTAL - Math.round((TOTAL * disk) / 100),
      disk_percent: disk,
    },
  };
}

export function json(body: unknown, status = 200): {
  status: number;
  contentType: string;
  body: string;
} {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
