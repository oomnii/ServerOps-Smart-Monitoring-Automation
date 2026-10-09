import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

interface StatusIndicatorProps {
  status: "loading" | "online" | "offline";
  label?: string;
}

const STATUS_ICON = {
  loading: LoaderCircle,
  online: CircleCheck,
  offline: CircleAlert,
} as const;

export function StatusIndicator({ status, label = "API" }: StatusIndicatorProps) {
  const Icon = STATUS_ICON[status];
  const text =
    status === "loading"
      ? `Checking ${label}`
      : status === "online"
        ? `${label} online`
        : `${label} offline`;

  return (
    <p className={`status status-${status}`} role="status">
      <Icon className="status-icon" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
