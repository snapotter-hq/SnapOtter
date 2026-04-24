import { useEffect, useState } from "react";
import { formatHeaders } from "@/lib/api";
import { useConnectionStore } from "@/stores/connection-store";

interface AuthState {
  loading: boolean;
  authEnabled: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  role: string | null;
  permissions: string[];
  analyticsEnabled: boolean | null;
  analyticsConsentShownAt: number | null;
  analyticsConsentRemindAt: number | null;
}

const USER_PERMISSIONS = [
  "tools:use",
  "files:own",
  "apikeys:own",
  "pipelines:own",
  "settings:read",
];

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authEnabled: false,
    isAuthenticated: false,
    mustChangePassword: false,
    role: null,
    permissions: [],
    analyticsEnabled: null,
    analyticsConsentShownAt: null,
    analyticsConsentRemindAt: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const configRes = await fetch("/api/v1/config/auth");
        const config = await configRes.json();

        if (!config.authEnabled) {
          if (!cancelled)
            setState({
              loading: false,
              authEnabled: false,
              isAuthenticated: true,
              mustChangePassword: false,
              role: "user",
              permissions: USER_PERMISSIONS,
              analyticsEnabled: null,
              analyticsConsentShownAt: null,
              analyticsConsentRemindAt: null,
            });
          return;
        }

        const token = localStorage.getItem("snapotter-token");
        if (!token) {
          if (!cancelled)
            setState({
              loading: false,
              authEnabled: true,
              isAuthenticated: false,
              mustChangePassword: false,
              role: null,
              permissions: [],
              analyticsEnabled: null,
              analyticsConsentShownAt: null,
              analyticsConsentRemindAt: null,
            });
          return;
        }

        const sessionRes = await fetch("/api/auth/session", {
          headers: formatHeaders(),
        });

        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const mustChange = session.user?.mustChangePassword === true;
          if (!cancelled)
            setState({
              loading: false,
              authEnabled: true,
              isAuthenticated: true,
              mustChangePassword: mustChange,
              role: session.user?.role ?? null,
              permissions: session.user?.permissions ?? [],
              analyticsEnabled: session.user?.analyticsEnabled ?? null,
              analyticsConsentShownAt: session.user?.analyticsConsentShownAt ?? null,
              analyticsConsentRemindAt: session.user?.analyticsConsentRemindAt ?? null,
            });
        } else {
          localStorage.removeItem("snapotter-token");
          if (!cancelled)
            setState({
              loading: false,
              authEnabled: true,
              isAuthenticated: false,
              mustChangePassword: false,
              role: null,
              permissions: [],
              analyticsEnabled: null,
              analyticsConsentShownAt: null,
              analyticsConsentRemindAt: null,
            });
        }
      } catch {
        // API unreachable — stay in loading state.
        // ConnectionBanner explains the outage. AuthGuard shows spinner.
      }
    }

    checkAuth();

    const unsubscribe = useConnectionStore.subscribe((curr, prev) => {
      if (prev.status !== "reconnected" && curr.status === "reconnected") {
        checkAuth();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const hasPermission = (permission: string) => state.permissions.includes(permission);

  return { ...state, hasPermission };
}
