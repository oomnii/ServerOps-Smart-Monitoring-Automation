const BINARY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unavailable";
  }

  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < BINARY_UNITS.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${BINARY_UNITS[unitIndex]}`;
}

export function formatTimestamp(utcTimestamp: string): string {
  const date = new Date(utcTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}
