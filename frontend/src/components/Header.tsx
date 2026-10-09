import { LogOut, RefreshCw } from "lucide-react";
import { NavLink } from "react-router-dom";
import { StatusIndicator } from "./StatusIndicator.tsx";

interface HeaderProps {
  title?: string;
  statusLabel?: string;
  status: "loading" | "online" | "offline";
  refreshing: boolean;
  username: string;
  loggingOut: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

export function Header({
  title = "Smart Server Monitoring Dashboard",
  statusLabel = "API",
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
        <h1>{title}</h1>
        <nav className="app-nav" aria-label="Main">
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/analytics">Analytics & API Testing</NavLink>
        </nav>
      </div>
      <div className="header-actions">
        <p className="signed-in">Signed in as {username}</p>
        <StatusIndicator status={status} label={statusLabel} />
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
