export interface CpuMetrics {
  cpu_percent: number;
  logical_cores: number;
}

export interface MemoryMetrics {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  memory_percent: number;
}

export interface DiskMetrics {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  disk_percent: number;
}

export interface SystemMetrics {
  timestamp_utc: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
}

export interface HealthResponse {
  status: "ok";
  service: "serverops-api";
}
