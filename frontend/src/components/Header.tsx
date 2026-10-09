import { LogOut, RefreshCw } from "lucide-react";
import { StatusIndicator } from "./StatusIndicator.tsx";

interface HeaderProps {
  status: "loading" | "online" | "offline";
  refreshing: boolean;
  username: string;
  loggingOut: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

export function Header({
  status,
  refreshing,
  username,
  loggingOut,
  onRefresh,
  onLogout,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="brand-block">
        <p className="brand">ServerOps</p>
        <h1>Smart Server Monitoring Dashboard</h1>
      </div>
      <div className="header-actions">
        <p className="signed-in">Signed in as {username}</p>
        <StatusIndicator status={status} />
        <button
          type="button"
          className="refresh"
          onClick={onRefresh}
          disabled={refreshing || loggingOut}
          aria-busy={refreshing}
        >
          <RefreshCw aria-hidden="true" className={refreshing ? "spin" : undefined} />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
        <button
          type="button"
          className="logout"
          onClick={onLogout}
          disabled={loggingOut}
        >
          <LogOut aria-hidden="true" />
          {loggingOut ? "Signing out" : "Log out"}
        </button>
      </div>
    </header>
  );
}
