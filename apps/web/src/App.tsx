import { ANALYTICS_EVENTS, en } from "@snapotter/shared";
import { Component, type ErrorInfo, lazy, type ReactNode, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { ConnectionMonitor } from "./components/common/connection-monitor";
import { KeyboardShortcutProvider } from "./components/common/keyboard-shortcut-provider";
import { MigrationBanner } from "./components/common/migration-banner";
import { RouteAnnouncer } from "./components/common/route-announcer";
import { UsageSurveyOverlay } from "./components/onboarding/usage-survey-overlay";
import { I18nProvider } from "./contexts/i18n-context";
import { useAuth } from "./hooks/use-auth";
import { useMobile } from "./hooks/use-mobile";
import { initAnalytics, isAnalyticsActive, optOut, track } from "./lib/analytics";
import { AUTH_GUARD_UNGATED_PATHS } from "./lib/auth-routes";
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
const HomePage = lazy(() => import("./pages/home-page").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("./pages/login-page").then((m) => ({ default: m.LoginPage })));
const PrivacyPolicyPage = lazy(() =>
  import("./pages/privacy-policy-page").then((m) => ({ default: m.PrivacyPolicyPage })),
);
const EditorPage = lazy(() =>
  import("./pages/editor-page").then((m) => ({ default: m.EditorPage })),
);
const ToolPage = lazy(() => import("./pages/tool-page").then((m) => ({ default: m.ToolPage })));
const NotFoundPage = lazy(() =>
  import("./pages/not-found-page").then((m) => ({ default: m.NotFoundPage })),
);

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
    if (!isAnalyticsActive()) return; // respect the runtime opt-out
    // Mirror the crash class only (no PII). track() and Sentry are best-effort.
    track(ANALYTICS_EVENTS.TOOL_CLIENT_ERROR, { error_name: error.name });
    import("@sentry/react")
      .then((Sentry) => {
        Sentry.captureException(error);
      })
      .catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-background text-foreground">
          <div className="text-center space-y-4 max-w-md px-6">
            <h1 className="text-xl font-semibold">{en.common.somethingWentWrong}</h1>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || en.common.unexpectedError}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              {en.common.goHome}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading, authEnabled, isAuthenticated, mustChangePassword } = useAuth();
  const location = useLocation();

  // When auth is disabled, redirect away from login/change-password to prevent escalation
  if (
    !loading &&
    !authEnabled &&
    (location.pathname === "/login" || location.pathname === "/change-password")
  ) {
    return <Navigate to="/" replace />;
  }

  // Don't guard the login or change-password pages
  if (AUTH_GUARD_UNGATED_PATHS.has(location.pathname)) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">{en.common.loading}</p>
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
  const isMobile = useMobile();
  const analyticsConfig = useAnalyticsStore((s) => s.config);
  const analyticsConfigLoaded = useAnalyticsStore((s) => s.configLoaded);
  const fetchAnalyticsConfig = useAnalyticsStore((s) => s.fetchConfig);

  useEffect(() => {
    fetchAnalyticsConfig();
  }, [fetchAnalyticsConfig]);

  useEffect(() => {
    if (localStorage.getItem("snapotter-welcome") === "1") {
      localStorage.removeItem("snapotter-welcome");
      toast("Hello from the otter side! 🦦", {
        duration: 5000,
      });
    }
  }, []);

  useEffect(() => {
    if (!analyticsConfigLoaded) return;
    if (analyticsConfig?.enabled) {
      void initAnalytics(analyticsConfig);
    } else if (isAnalyticsActive()) {
      // Instance-wide opt-out observed after this tab already initialized.
      optOut();
    }
  }, [analyticsConfigLoaded, analyticsConfig]);

  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === "visible") void fetchAnalyticsConfig();
    };
    document.addEventListener("visibilitychange", refetch);
    window.addEventListener("focus", refetch);
    return () => {
      document.removeEventListener("visibilitychange", refetch);
      window.removeEventListener("focus", refetch);
    };
  }, [fetchAnalyticsConfig]);

  return (
    <ErrorBoundary>
      <I18nProvider>
        <ConnectionMonitor />
        <Toaster position={isMobile ? "top-center" : "bottom-right"} />
        <BrowserRouter>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
          >
            {en.a11y.skipToContent}
          </a>
          <RouteAnnouncer />
          <KeyboardShortcutProvider>
            <AuthGuard>
              <MigrationBanner />
              <UsageSurveyOverlay />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/change-password" element={<ChangePasswordPage />} />
                  <Route path="/automate" element={<AutomatePage />} />
                  <Route path="/files" element={<FilesPage />} />
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/editor" element={<EditorPage />} />
                  {/* Legacy 1.x color tools were consolidated into adjust-colors;
                      redirect old bookmarks to the section route. */}
                  <Route
                    path="/brightness-contrast"
                    element={<Navigate to="/image/adjust-colors" replace />}
                  />
                  <Route
                    path="/saturation"
                    element={<Navigate to="/image/adjust-colors" replace />}
                  />
                  <Route
                    path="/color-channels"
                    element={<Navigate to="/image/adjust-colors" replace />}
                  />
                  <Route
                    path="/color-effects"
                    element={<Navigate to="/image/adjust-colors" replace />}
                  />
                  <Route path="/:section/:toolId" element={<ToolPage />} />
                  <Route path="/" element={<HomePage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </AuthGuard>
          </KeyboardShortcutProvider>
        </BrowserRouter>
      </I18nProvider>
    </ErrorBoundary>
  );
}
