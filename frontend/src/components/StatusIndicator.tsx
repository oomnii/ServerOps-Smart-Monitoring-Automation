interface StatusIndicatorProps {
  status: "loading" | "online" | "offline";
}

const STATUS_TEXT = {
  loading: "Checking API",
  online: "API online",
  offline: "API offline",
} as const;

export function StatusIndicator({ status }: StatusIndicatorProps) {
  return (
    <p className={`status status-${status}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      <span>{STATUS_TEXT[status]}</span>
    </p>
  );
}
