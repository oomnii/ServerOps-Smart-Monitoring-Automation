import type { HistoryRange } from "../types/analytics.ts";

const RANGES: Array<{ id: HistoryRange; label: string }> = [
  { id: "15m", label: "Last 15 minutes" },
  { id: "1h", label: "Last 1 hour" },
  { id: "6h", label: "Last 6 hours" },
  { id: "24h", label: "Last 24 hours" },
];

interface TimeRangeSelectorProps {
  value: HistoryRange;
  disabled: boolean;
  onChange: (range: HistoryRange) => void;
}

export function TimeRangeSelector({ value, disabled, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="range-selector" role="group" aria-label="Time range">
      {RANGES.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.id === value}
          disabled={disabled}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
