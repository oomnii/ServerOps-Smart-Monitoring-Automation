import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoryRange, HistorySeries, HistoryUnit } from "../types/analytics.ts";

const STROKES = ["#8C5A3C", "#C08552", "#4B2E2B"];
const DASHES = ["0", "6 4", "2 3"];

interface AnalyticsChartProps {
  title: string;
  unit: HistoryUnit;
  range: HistoryRange;
  stepSeconds: number;
  series: HistorySeries[];
  status: "loading" | "ready" | "empty" | "error";
  note?: string;
}

interface ChartRow {
  timestamp: number;
  [label: string]: number | null;
}

export function AnalyticsChart({
  title,
  unit,
  range,
  stepSeconds,
  series,
  status,
  note,
}: AnalyticsChartProps) {
  const rows = status === "ready" ? buildRows(series, stepSeconds) : [];
  const sampleCount = new Set(series.flatMap((item) => item.points.map((point) => point.timestamp))).size;

  return (
    <section className="chart-card" aria-label={title}>
      <h2>{title}</h2>
      {status === "loading" ? (
        <p className="chart-message" role="status">
          Loading historical metrics.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="chart-message">History is unavailable.</p>
      ) : null}
      {status === "empty" ? (
        <p className="chart-message">No samples in this range.</p>
      ) : null}
      {status === "ready" ? (
        <>
          <p className="chart-latest">
            <span className="meta-label">{sampleCount} samples</span>
            {series.map((item) => {
              const last = item.points[item.points.length - 1];
              if (!last) {
                return null;
              }
              return (
                <span key={item.label}>
                  {item.label} {formatHistoryValue(last.value, unit)}{" "}
                  <time dateTime={new Date(last.timestamp * 1000).toISOString()}>
                    {formatSampleTime(last.timestamp)}
                  </time>
                </span>
              );
            })}
          </p>
          <div className="chart-plot">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#D9CFC7" strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value: number) => formatAxisTime(value, range)}
                  tick={{ fill: "#4B2E2B", fontSize: 12 }}
                  stroke="#C9B59C"
                  minTickGap={28}
                  label={{ value: "Time", position: "insideBottom", offset: -2, fill: "#8C5A3C" }}
                />
                <YAxis
                  domain={unit === "percent" ? [0, 100] : [0, "dataMax"]}
                  tick={{ fill: "#4B2E2B", fontSize: 12 }}
                  stroke="#C9B59C"
                  width={unit === "percent" ? 52 : 48}
                  label={{
                    value: unit === "percent" ? "Percent" : "Req/s",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#8C5A3C",
                    style: { textAnchor: "middle" },
                  }}
                />
                <Tooltip
                  content={(props) => (
                    <ChartTooltip
                      active={props.active}
                      label={typeof props.label === "number" ? props.label : undefined}
                      payload={props.payload?.map((item) => ({
                        name: item.name == null ? undefined : String(item.name),
                        value: typeof item.value === "number" ? item.value : null,
                        color: typeof item.color === "string" ? item.color : undefined,
                      }))}
                      unit={unit}
                    />
                  )}
                />
                <Legend wrapperStyle={{ color: "#4B2E2B" }} />
                {series.map((item, index) => (
                  <Line
                    key={item.label}
                    type="linear"
                    dataKey={item.label}
                    name={item.label}
                    stroke={STROKES[index % STROKES.length]}
                    strokeDasharray={DASHES[index % DASHES.length]}
                    strokeWidth={2}
                    connectNulls={false}
                    isAnimationActive={false}
                    dot={(dotProps) => (
                      <SampleDot {...dotProps} unit={unit} stroke={STROKES[index % STROKES.length]} />
                    )}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
      {note ? <p className="note">{note}</p> : null}
    </section>
  );
}

function buildRows(series: HistorySeries[], stepSeconds: number): ChartRow[] {
  const stamps = [
    ...new Set(series.flatMap((item) => item.points.map((point) => point.timestamp))),
  ].sort((left, right) => left - right);
  const timeline: number[] = [];
  for (const stamp of stamps) {
    const previous = timeline[timeline.length - 1];
    if (previous !== undefined && stamp - previous > stepSeconds * 2) {
      timeline.push(previous + stepSeconds);
    }
    timeline.push(stamp);
  }
  return timeline.map((timestamp) => {
    const row: ChartRow = { timestamp };
    for (const item of series) {
      const point = item.points.find((candidate) => candidate.timestamp === timestamp);
      row[item.label] = point ? point.value : null;
    }
    return row;
  });
}

function SampleDot({
  cx,
  cy,
  value,
  payload,
  stroke,
  unit,
}: {
  cx?: number;
  cy?: number;
  value?: number | string | null;
  payload?: { timestamp?: number };
  stroke?: string;
  unit: HistoryUnit;
}) {
  if (cx == null || cy == null || typeof value !== "number" || !Number.isFinite(value)) {
    return <g />;
  }
  const when =
    typeof payload?.timestamp === "number"
      ? new Date(payload.timestamp * 1000).toISOString()
      : "";
  return (
    <circle cx={cx} cy={cy} r={3} fill={stroke ?? "#8C5A3C"}>
      <title>{`${formatHistoryValue(value, unit)} at ${when}`}</title>
    </circle>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  label?: number;
  payload?: ReadonlyArray<{ name?: string; value?: number | string | null; color?: string }>;
  unit: HistoryUnit;
}) {
  if (!active || label == null || !payload?.length) {
    return null;
  }
  const rows = payload.filter((item) => typeof item.value === "number");
  if (!rows.length) {
    return null;
  }
  return (
    <div className="chart-tooltip">
      <p>{formatSampleTime(label)}</p>
      {rows.map((item) => (
        <p key={item.name}>
          {item.name}: {formatHistoryValue(Number(item.value), unit)}
        </p>
      ))}
    </div>
  );
}

function formatHistoryValue(value: number, unit: HistoryUnit): string {
  if (unit === "percent") {
    return `${value.toFixed(1)}%`;
  }
  const digits = value >= 10 ? 1 : 3;
  const text = value
    .toFixed(digits)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  return `${text} req/s`;
}

function formatSampleTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAxisTime(unixSeconds: number, range: HistoryRange): string {
  const date = new Date(unixSeconds * 1000);
  if (range === "6h" || range === "24h") {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
