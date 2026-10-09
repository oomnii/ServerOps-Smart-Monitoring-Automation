import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

interface StatusIndicatorProps {
  status: "loading" | "online" | "offline";
}

const STATUS_TEXT = {
  loading: "Checking API",
  online: "API online",
  offline: "API offline",
} as const;

const STATUS_ICON = {
  loading: LoaderCircle,
  online: CircleCheck,
  offline: CircleAlert,
} as const;

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const Icon = STATUS_ICON[status];

  return (
    <p className={`status status-${status}`} role="status">
      <Icon className="status-icon" aria-hidden="true" />
      <span>{STATUS_TEXT[status]}</span>
    </p>
  );
}
