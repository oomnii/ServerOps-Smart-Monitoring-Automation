import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./auth/useSession.ts";
import { AnalyticsPage } from "./components/AnalyticsPage.tsx";
import { Dashboard } from "./components/Dashboard.tsx";
import { LoginScreen } from "./components/LoginScreen.tsx";

export default function App() {
  const session = useSession();

  if (session.status === "checking") {
    return (
      <div className="page">
        <main id="main" className="login-wrap">
          <p className="login-card" role="status">
            Checking your session.
          </p>
        </main>
      </div>
    );
  }

  if (session.status === "unreachable") {
    return (
      <div className="page">
        <main id="main" className="login-wrap">
          <section className="login-card">
            <p className="brand">ServerOps</p>
            <h1>API unavailable</h1>
            <p className="banner" role="alert">
              {session.notice}
            </p>
            <button type="button" className="refresh" onClick={() => void session.check()}>
              Try again
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (session.status === "authenticated" || session.status === "signing-out") {
    const pageProps = {
      username: session.username ?? "",
      loggingOut: session.status === "signing-out",
      logoutError: session.logoutError,
      onLogout: () => void session.signOut(),
      onAuthFailure: session.expire,
    };
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard {...pageProps} />} />
          <Route path="/analytics" element={<AnalyticsPage {...pageProps} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return <LoginScreen notice={session.notice} onSuccess={session.signedIn} />;
}
