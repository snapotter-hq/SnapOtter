import { useEffect, useState } from "react";
import { clearToken, formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { useConnectionStore } from "@/stores/connection-store";

interface AuthState {
  loading: boolean;
  authEnabled: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  username: string | null;
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

// /api/v1/config/auth returns instance config (auth mode, OIDC/SAML setup, and
// whether SSO is enforced) that changes only when an admin edits settings or
// the server restarts. useAuth() runs in many components, so without sharing
// this the tool page fetches it once per consumer (6+ times on initial load).
// Share a single fetch; reset on failure so a transient error can be retried.
//
// A non-2xx answer is a failure too. Its JSON body (a rate limit's, an error
// handler's) has no `authEnabled`, which would read as "auth is off" and put
// the app in anonymous-admin mode for the life of the page (#2297).
/** First retry after a failed auth check, doubling up to the cap. */
const AUTH_RETRY_BASE_MS = 1_000;
const AUTH_RETRY_MAX_MS = 30_000;

let authConfigPromise: Promise<AuthConfig> | null = null;
function fetchAuthConfig(): Promise<AuthConfig> {
  if (!authConfigPromise) {
    authConfigPromise = fetch(appUrl("/api/v1/config/auth"))
      .then((res) => {
        if (!res.ok) throw new Error(`Auth config request failed with ${res.status}`);
        return res.json().then((config: AuthConfig) => {
          if (typeof config?.authEnabled !== "boolean") {
            throw new Error("Auth config response has no authEnabled flag");
          }
          return config;
        });
      })
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
    username: null,
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
    // Retry state for a failed auth check. The connection store's reconnect
    // re-check only fires when /health itself failed, so a failure that leaves
    // /health healthy (a rate limit shared with it, a proxy that answers one
    // path differently) would otherwise leave this hook loading for good.
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    async function checkAuth() {
      clearTimeout(retryTimer); // a reconnect re-check replaces a pending retry
      try {
        const config = await fetchAuthConfig();

        if (!config.authEnabled) {
          if (!cancelled)
            setState({
              loading: false,
              authEnabled: false,
              isAuthenticated: true,
              mustChangePassword: false,
              username: null,
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
          failures = 0;
          return;
        }

        // Always call /api/auth/session: OIDC users have a session cookie
        // (not a localStorage token), so we cannot skip based on token absence.
        const sessionRes = await fetch(appUrl("/api/auth/session"), {
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
              username: session.user?.username ?? null,
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
              username: null,
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
        failures = 0;
      } catch (err) {
        // The auth config or the session check failed: stay in the loading
        // state rather than guess (never anonymous admin), and ask again with
        // a capped backoff. When the server itself is down the ConnectionBanner
        // explains it and the reconnect re-check also runs; a failure that
        // leaves /health healthy has only this retry (#2297).
        if (cancelled) return;
        const delay = Math.min(AUTH_RETRY_MAX_MS, AUTH_RETRY_BASE_MS * 2 ** failures++);
        console.warn(`Auth check failed, retrying in ${delay / 1000}s`, err);
        retryTimer = setTimeout(checkAuth, delay);
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
      clearTimeout(retryTimer);
      unsubscribe();
    };
  }, []);

  const hasPermission = (permission: string) => state.permissions.includes(permission);

  return { ...state, hasPermission };
}
