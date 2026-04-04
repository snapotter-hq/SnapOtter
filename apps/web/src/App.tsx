import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { KeyboardShortcutProvider } from "./components/common/keyboard-shortcut-provider";
import { useAuth } from "./hooks/use-auth";
import { AutomatePage } from "./pages/automate-page";
import { ChangePasswordPage } from "./pages/change-password-page";
import { FilesPage } from "./pages/files-page";
import { FullscreenGridPage } from "./pages/fullscreen-grid-page";
import { HomePage } from "./pages/home-page";
import { LoginPage } from "./pages/login-page";
import { PrivacyPolicyPage } from "./pages/privacy-policy-page";
import { ToolPage } from "./pages/tool-page";

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

export function App() {
  return (
    <ErrorBoundary>
      <Toaster position="bottom-right" />
      <BrowserRouter>
        <KeyboardShortcutProvider>
          <AuthGuard>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/automate" element={<AutomatePage />} />
              <Route path="/files" element={<FilesPage />} />
              <Route path="/fullscreen" element={<FullscreenGridPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/:toolId" element={<ToolPage />} />
              <Route path="/" element={<HomePage />} />
            </Routes>
          </AuthGuard>
        </KeyboardShortcutProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
