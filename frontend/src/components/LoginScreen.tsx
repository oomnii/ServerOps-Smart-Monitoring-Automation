import { useState, type FormEvent } from "react";
import { ApiError, login } from "../services/api.ts";

interface LoginScreenProps {
  notice: string | null;
  onSuccess: (username: string) => void;
}

export function LoginScreen({ notice, onSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setOffline(false);
    const controller = new AbortController();
    try {
      const session = await login(username, password, controller.signal);
      setPassword("");
      onSuccess(session.username);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === null) {
        setOffline(true);
        setError(caught.message);
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError("Sign-in failed.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <main id="main" className="login-wrap">
        <form className="login-card" onSubmit={onSubmit}>
          <p className="brand">ServerOps</p>
          <h1>Sign in</h1>
          <p className="lede">
            Monitoring data is available to an active administrator. API health stays
            public and does not include CPU, memory, or disk readings.
          </p>
          {notice ? (
            <p className="banner" role="alert">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className={`banner${offline ? " banner-offline" : ""}`} role="alert">
              {error}
            </p>
          ) : null}
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            disabled={submitting}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={submitting}
          />
          <button type="submit" className="refresh" disabled={submitting} aria-busy={submitting}>
            {submitting ? "Signing in" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
