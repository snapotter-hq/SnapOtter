import { Component, type ErrorInfo, type ReactNode, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { ConnectionBanner } from "./components/common/connection-banner";
import { KeyboardShortcutProvider } from "./components/common/keyboard-shortcut-provider";
import { useAuth } from "./hooks/use-auth";
import { useConnectionMonitor } from "./hooks/use-connection-monitor";
import { isChunkError, lazyWithRetry } from "./lib/lazy-with-retry";

// Lazy-load all pages with automatic retry so chunk failures from
// deployments are recovered transparently instead of white-screening.
const AutomatePage = lazyWithRetry(() =>
  import("./pages/automate-page").then((m) => ({ default: m.AutomatePage })),
);
const ChangePasswordPage = lazyWithRetry(() =>
  import("./pages/change-password-page").then((m) => ({ default: m.ChangePasswordPage })),
);
const FilesPage = lazyWithRetry(() =>
  import("./pages/files-page").then((m) => ({ default: m.FilesPage })),
);
const FullscreenGridPage = lazyWithRetry(() =>
  import("./pages/fullscreen-grid-page").then((m) => ({ default: m.FullscreenGridPage })),
);
const HomePage = lazyWithRetry(() =>
  import("./pages/home-page").then((m) => ({ default: m.HomePage })),
);
const LoginPage = lazyWithRetry(() =>
  import("./pages/login-page").then((m) => ({ default: m.LoginPage })),
);
const PrivacyPolicyPage = lazyWithRetry(() =>
  import("./pages/privacy-policy-page").then((m) => ({ default: m.PrivacyPolicyPage })),
);
const ToolPage = lazyWithRetry(() =>
  import("./pages/tool-page").then((m) => ({ default: m.ToolPage })),
);

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null; isChunkError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, isChunkError: isChunkError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div className="flex h-screen items-center justify-center bg-background text-foreground">
            <div className="text-center space-y-4 max-w-md px-6">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <svg
                  className="h-6 w-6 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  role="img"
                  aria-label="Refresh icon"
                >
                  <title>Refresh</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-semibold">Update Available</h1>
              <p className="text-sm text-muted-foreground">
                A new version of ashim has been deployed.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                Refresh
              </button>
            </div>
          </div>
        );
      }
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
                this.setState({ hasError: false, error: null, isChunkError: false });
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
  const { loading, authEnabled, isAuthenticated, mustChangePassword } = useAuth();
  const location = useLocation();

  // Don't guard the login or change-password pages
  if (
    location.pathname === "/login" ||
    location.pathname === "/change-password" ||
    location.pathname === "/privacy"
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

function ConnectionMonitor() {
  useConnectionMonitor();
  return null;
}

export function App() {
  return (
    <>
      <ConnectionMonitor />
      <ConnectionBanner />
      <ErrorBoundary>
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
                  <Route
                    path="/color-channels"
                    element={<Navigate to="/adjust-colors" replace />}
                  />
                  <Route path="/color-effects" element={<Navigate to="/adjust-colors" replace />} />
                  <Route path="/:toolId" element={<ToolPage />} />
                  <Route path="/" element={<HomePage />} />
                </Routes>
              </Suspense>
            </AuthGuard>
          </KeyboardShortcutProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </>
  );
}
