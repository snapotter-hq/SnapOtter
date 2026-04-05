import { useEffect, useState } from "react";
import { formatHeaders } from "@/lib/api";

interface AuthState {
  loading: boolean;
  authEnabled: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authEnabled: false,
    isAuthenticated: false,
    mustChangePassword: false,
  });

  useEffect(() => {
    async function checkAuth() {
      try {
        // Check if auth is enabled
        const configRes = await fetch("/api/v1/config/auth");
        const config = await configRes.json();

        if (!config.authEnabled) {
          setState({
            loading: false,
            authEnabled: false,
            isAuthenticated: true,
            mustChangePassword: false,
          });
          return;
        }

        // Auth is enabled — check if we have a valid session
        const token = localStorage.getItem("stirling-token");
        if (!token) {
          setState({
            loading: false,
            authEnabled: true,
            isAuthenticated: false,
            mustChangePassword: false,
          });
          return;
        }

        const sessionRes = await fetch("/api/auth/session", {
          headers: formatHeaders(),
        });

        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const mustChange = session.user?.mustChangePassword === true;
          setState({
            loading: false,
            authEnabled: true,
            isAuthenticated: true,
            mustChangePassword: mustChange,
          });
        } else {
          localStorage.removeItem("stirling-token");
          setState({
            loading: false,
            authEnabled: true,
            isAuthenticated: false,
            mustChangePassword: false,
          });
        }
      } catch {
        // Can't reach API — assume no auth needed (dev mode)
        setState({
          loading: false,
          authEnabled: false,
          isAuthenticated: true,
          mustChangePassword: false,
        });
      }
    }

    checkAuth();
  }, []);

  return state;
}
