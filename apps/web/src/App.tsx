import { APP_VERSION, en, shouldShowConsent } from "@snapotter/shared";
import { Component, type ErrorInfo, lazy, type ReactNode, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { ConnectionMonitor } from "./components/common/connection-monitor";
import { KeyboardShortcutProvider } from "./components/common/keyboard-shortcut-provider";
import { RouteAnnouncer } from "./components/common/route-announcer";
import { I18nProvider } from "./contexts/i18n-context";
import { useAuth } from "./hooks/use-auth";
import { useMobile } from "./hooks/use-mobile";
import { identify, initAnalytics, setAnalyticsConsent } from "./lib/analytics";
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
const AnalyticsConsentPage = lazy(() =>
  import("./pages/analytics-consent-page").then((m) => ({ default: m.AnalyticsConsentPage })),
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
  const isMobile = useMobile();
  const analyticsConfig = useAnalyticsStore((s) => s.config);
  const analyticsConfigLoaded = useAnalyticsStore((s) => s.configLoaded);
  const fetchAnalyticsConfig = useAnalyticsStore((s) => s.fetchConfig);
  const analyticsConsent = useAnalyticsStore((s) => s.consent);

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
    if (
      !analyticsConfigLoaded ||
      !analyticsConfig?.enabled ||
      analyticsConsent.analyticsEnabled !== true
    )
      return;
    void (async () => {
      setAnalyticsConsent(true);
      await initAnalytics(analyticsConfig);
      identify(
        analyticsConfig.instanceId,
        { version: APP_VERSION },
        { instance_id: analyticsConfig.instanceId },
      );
    })();
  }, [analyticsConfigLoaded, analyticsConfig, analyticsConsent.analyticsEnabled]);

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
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/change-password" element={<ChangePasswordPage />} />
                  <Route path="/automate" element={<AutomatePage />} />
                  <Route path="/files" element={<FilesPage />} />
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/analytics-consent" element={<AnalyticsConsentPage />} />
                  <Route path="/editor" element={<EditorPage />} />
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
