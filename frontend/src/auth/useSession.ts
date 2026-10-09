import { useCallback, useEffect, useState } from "react";
import { ApiError, getSession, logout } from "../services/api.ts";

export type SessionStatus =
  | "checking"
  | "authenticated"
  | "unauthenticated"
  | "signing-out"
  | "unreachable";

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useSession() {
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [username, setUsername] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const check = useCallback(async () => {
    const controller = new AbortController();
    setStatus("checking");
    setLogoutError(null);
    try {
      const session = await getSession(controller.signal);
      setUsername(session.username);
      setNotice(null);
      setStatus("authenticated");
    } catch (error) {
      if (isAbort(error)) {
        return;
      }
      setUsername(null);
      if (error instanceof ApiError && error.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setNotice(error.message);
        setStatus("unauthenticated");
        return;
      }
      setNotice(
        error instanceof ApiError
          ? error.message
          : "The monitoring API is not reachable. Start Django on 127.0.0.1:8000.",
      );
      setStatus("unreachable");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const session = await getSession(controller.signal);
        setUsername(session.username);
        setNotice(null);
        setStatus("authenticated");
      } catch (error) {
        if (isAbort(error)) {
          return;
        }
        setUsername(null);
        if (error instanceof ApiError && error.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          setNotice(error.message);
          setStatus("unauthenticated");
          return;
        }
        setNotice(
          error instanceof ApiError
            ? error.message
            : "The monitoring API is not reachable. Start Django on 127.0.0.1:8000.",
        );
        setStatus("unreachable");
      }
    })();
    return () => controller.abort();
  }, []);

  async function signOut() {
    setStatus("signing-out");
    setLogoutError(null);
    const controller = new AbortController();
    try {
      await logout(controller.signal);
      setUsername(null);
      setNotice(null);
      setStatus("unauthenticated");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUsername(null);
        setNotice(null);
        setStatus("unauthenticated");
        return;
      }
      setStatus("authenticated");
      const detail = error instanceof ApiError ? error.message : "The monitoring API is not reachable.";
      setLogoutError(`${detail} The server session was not confirmed as ended.`);
    }
  }

  function expire(code: 401 | 403) {
    setUsername(null);
    setLogoutError(null);
    setNotice(
      code === 401
        ? "Your session has ended. Sign in again."
        : "You do not have access to monitoring data.",
    );
    setStatus("unauthenticated");
  }

  function signedIn(name: string) {
    setUsername(name);
    setNotice(null);
    setLogoutError(null);
    setStatus("authenticated");
  }

  return { status, username, notice, logoutError, check, signOut, expire, signedIn };
}
