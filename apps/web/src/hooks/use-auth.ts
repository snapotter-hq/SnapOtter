import { useEffect, useState } from "react";
import { clearToken, formatHeaders } from "@/lib/api";
import { useConnectionStore } from "@/stores/connection-store";

interface AuthState {
  loading: boolean;
  authEnabled: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  mfaRequired: boolean;
  role: string | null;
  permissions: string[];
  oidcEnabled: boolean;
  oidcProviderName: string | null;
  samlEnabled: boolean;
  samlProviderName: string | null;
  ssoEnforced: boolean;
  loginMethod: string | null;
  hasLocalPassword: boolean;
  totpEnabled: boolean;
}

const ANON_ADMIN_PERMISSIONS = [
  "tools:use",
  "files:own",
  "files:all",
  "apikeys:own",
  "apikeys:all",
  "pipelines:own",
  "pipelines:all",
  "settings:read",
  "settings:write",
  "users:manage",
  "teams:manage",
  "features:manage",
  "system:health",
  "audit:read",
];

interface AuthConfig {
  authEnabled: boolean;
  oidcEnabled?: boolean;
  oidcProviderName?: string | null;
  samlEnabled?: boolean;
  samlProviderName?: string | null;
  ssoEnforced?: boolean;
}

// /api/v1/config/auth returns static instance config (auth mode, OIDC/SAML
// setup) that cannot change without a server restart. useAuth() runs in many
// components, so without sharing this the tool page fetches it once per consumer
// (6+ times on initial load). Share a single fetch; reset on failure so a
// transient error can be retried.
let authConfigPromise: Promise<AuthConfig> | null = null;
function fetchAuthConfig(): Promise<AuthConfig> {
  if (!authConfigPromise) {
    authConfigPromise = fetch("/api/v1/config/auth")
      .then((res) => res.json() as Promise<AuthConfig>)
      .catch((err) => {
        authConfigPromise = null;
        throw err;
      });
  }
  return authConfigPromise;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authEnabled: false,
    isAuthenticated: false,
    mustChangePassword: false,
    mfaRequired: false,
    role: null,
    permissions: [],
    oidcEnabled: false,
    oidcProviderName: null,
    samlEnabled: false,
    samlProviderName: null,
    ssoEnforced: false,
    loginMethod: null,
    hasLocalPassword: false,
    totpEnabled: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const config = await fetchAuthConfig();

        if (!config.authEnabled) {
          if (!cancelled)
            setState({
              loading: false,
              authEnabled: false,
              isAuthenticated: true,
              mustChangePassword: false,
              mfaRequired: false,
              role: "admin",
              permissions: ANON_ADMIN_PERMISSIONS,
              oidcEnabled: false,
              oidcProviderName: null,
              samlEnabled: false,
              samlProviderName: null,
              ssoEnforced: false,
              loginMethod: null,
              hasLocalPassword: false,
              totpEnabled: false,
            });
          return;
        }

        // Always call /api/auth/session -- OIDC users have a session cookie
        // (not a localStorage token), so we cannot skip based on token absence.
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
              mfaRequired: session.user?.mfaRequired === true,
              role: session.user?.role ?? null,
              permissions: session.user?.permissions ?? [],
              oidcEnabled: config.oidcEnabled ?? false,
              oidcProviderName: config.oidcProviderName ?? null,
              samlEnabled: config.samlEnabled ?? false,
              samlProviderName: config.samlProviderName ?? null,
              ssoEnforced: config.ssoEnforced ?? false,
              loginMethod: session.user?.loginMethod ?? null,
              hasLocalPassword: session.user?.hasLocalPassword ?? false,
              totpEnabled: session.user?.totpEnabled === true,
            });
        } else {
          clearToken();
          if (!cancelled)
            setState({
              loading: false,
              authEnabled: true,
              isAuthenticated: false,
              mustChangePassword: false,
              mfaRequired: false,
              role: null,
              permissions: [],
              oidcEnabled: config.oidcEnabled ?? false,
              oidcProviderName: config.oidcProviderName ?? null,
              samlEnabled: config.samlEnabled ?? false,
              samlProviderName: config.samlProviderName ?? null,
              ssoEnforced: config.ssoEnforced ?? false,
              loginMethod: null,
              hasLocalPassword: false,
              totpEnabled: false,
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
