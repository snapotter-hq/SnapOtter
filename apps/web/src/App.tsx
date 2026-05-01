import { APP_VERSION, shouldShowConsent } from "@snapotter/shared";
import { Component, type ErrorInfo, lazy, type ReactNode, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { ConnectionMonitor } from "./components/common/connection-monitor";
import { KeyboardShortcutProvider } from "./components/common/keyboard-shortcut-provider";
import { useAuth } from "./hooks/use-auth";
import { identify, initAnalytics } from "./lib/analytics";
import { useAnalyticsStore } from "./stores/analytics-store";

// Lazy-load all pages so each page's JS (and its icons/deps) is only
// downloaded when the user navigates there, shrinking the main bundle.
const AutomatePage = lazy(() =>
  import("./pages/automate-page").then((m) => ({ default: m.AutomatePage })),
);
const ChangePasswordPage = lazy(() =>
  import("./pages/change-password-page").then((m) => ({ default: m.ChangePasswordPage })),
);
const FilesPage = lazy(() => import("./pages/files-page").then((m) => ({ default: m.FilesPage })));
const FullscreenGridPage = lazy(() =>
  import("./pages/fullscreen-grid-page").then((m) => ({ default: m.FullscreenGridPage })),
);
const HomePage = lazy(() => import("./pages/home-page").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("./pages/login-page").then((m) => ({ default: m.LoginPage })));
const PrivacyPolicyPage = lazy(() =>
  import("./pages/privacy-policy-page").then((m) => ({ default: m.PrivacyPolicyPage })),
);
const AnalyticsConsentPage = lazy(() =>
  import("./pages/analytics-consent-page").then((m) => ({ default: m.AnalyticsConsentPage })),
);
const ToolPage = lazy(() => import("./pages/tool-page").then((m) => ({ default: m.ToolPage })));

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-background text-foreground">
          <div className="text-center space-y-4 max-w-md px-6">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const {
    loading,
    authEnabled,
    isAuthenticated,
    mustChangePassword,
    analyticsEnabled,
    analyticsConsentShownAt,
    analyticsConsentRemindAt,
  } = useAuth();
  const storeConsent = useAnalyticsStore((s) => s.consent);
  const setStoreConsent = useAnalyticsStore((s) => s.setConsent);
  const analyticsConfig = useAnalyticsStore((s) => s.config);
  const location = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: only hydrate on session load, not on store changes
  useEffect(() => {
    if (
      !loading &&
      analyticsEnabled !== undefined &&
      storeConsent.analyticsConsentShownAt === null &&
      storeConsent.analyticsEnabled === null
    ) {
      setStoreConsent({
        analyticsEnabled: analyticsEnabled ?? null,
        analyticsConsentShownAt: analyticsConsentShownAt ?? null,
        analyticsConsentRemindAt: analyticsConsentRemindAt ?? null,
      });
    }
  }, [loading, analyticsEnabled, analyticsConsentShownAt, setStoreConsent]);

  // When auth is disabled, redirect away from login/change-password to prevent escalation
  if (
    !loading &&
    !authEnabled &&
    (location.pathname === "/login" || location.pathname === "/change-password")
  ) {
    return <Navigate to="/" replace />;
  }

  // Don't guard the login or change-password pages
  if (
    location.pathname === "/login" ||
    location.pathname === "/change-password" ||
    location.pathname === "/privacy" ||
    location.pathname === "/analytics-consent"
  ) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (authEnabled && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Force password change before allowing access to the app
  if (authEnabled && mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  const effectiveConsent = {
    analyticsEnabled: storeConsent.analyticsEnabled ?? analyticsEnabled ?? null,
    analyticsConsentShownAt:
      storeConsent.analyticsConsentShownAt ?? analyticsConsentShownAt ?? null,
    analyticsConsentRemindAt:
      storeConsent.analyticsConsentRemindAt ?? analyticsConsentRemindAt ?? null,
  };
  const serverEnabled = analyticsConfig?.enabled ?? false;
  if (
    authEnabled &&
    analyticsConfig !== null &&
    shouldShowConsent(effectiveConsent, serverEnabled)
  ) {
    return <Navigate to="/analytics-consent" replace />;
  }

  return <>{children}</>;
}

// Single page-level loading fallback — shown while JS for a route downloads.
function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function App() {
  const analyticsConfig = useAnalyticsStore((s) => s.config);
  const analyticsConfigLoaded = useAnalyticsStore((s) => s.configLoaded);
  const fetchAnalyticsConfig = useAnalyticsStore((s) => s.fetchConfig);
  const analyticsConsent = useAnalyticsStore((s) => s.consent);

  useEffect(() => {
    fetchAnalyticsConfig();
  }, [fetchAnalyticsConfig]);

  useEffect(() => {
    if (
      !analyticsConfigLoaded ||
      !analyticsConfig?.enabled ||
      analyticsConsent.analyticsEnabled !== true
    )
      return;
    void (async () => {
      await initAnalytics(analyticsConfig);
      identify(analyticsConfig.instanceId, {
        $set: { version: APP_VERSION },
        $set_once: { instance_id: analyticsConfig.instanceId },
      });
    })();
  }, [analyticsConfigLoaded, analyticsConfig, analyticsConsent.analyticsEnabled]);

  return (
    <ErrorBoundary>
      <ConnectionMonitor />
      <Toaster position="bottom-right" />
      <BrowserRouter>
        <KeyboardShortcutProvider>
          <AuthGuard>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/change-password" element={<ChangePasswordPage />} />
                <Route path="/automate" element={<AutomatePage />} />
                <Route path="/files" element={<FilesPage />} />
                <Route path="/fullscreen" element={<FullscreenGridPage />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                {/* Redirects: old color tools consolidated into adjust-colors */}
                <Route
                  path="/brightness-contrast"
                  element={<Navigate to="/adjust-colors" replace />}
                />
                <Route path="/saturation" element={<Navigate to="/adjust-colors" replace />} />
                <Route path="/color-channels" element={<Navigate to="/adjust-colors" replace />} />
                <Route path="/color-effects" element={<Navigate to="/adjust-colors" replace />} />
                <Route path="/analytics-consent" element={<AnalyticsConsentPage />} />
                <Route path="/:toolId" element={<ToolPage />} />
                <Route path="/" element={<HomePage />} />
              </Routes>
            </Suspense>
          </AuthGuard>
        </KeyboardShortcutProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
