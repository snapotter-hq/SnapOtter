import {
  APP_VERSION,
  CATEGORIES,
  CORE_AUDIT_EVENTS,
  isPasswordRuleEnabled,
  isValidRoleName,
  isValidUsername,
  normalizeRoleName,
  type Permission,
  SafeError,
  SUPPORTED_LOCALES,
  TEAM_NAME_MAX_LENGTH,
  TOOLS,
  type TranslationKeys,
} from "@snapotter/shared";
import {
  BarChart3,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Info,
  Key,
  Loader2,
  Lock,
  LogOut,
  Monitor,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useMobile } from "@/hooks/use-mobile";
import { useTimeouts } from "@/hooks/use-timeouts";
import { captureHandledError } from "@/lib/analytics";
import {
  ApiError,
  apiDelete,
  apiErrorMessage,
  apiGet,
  apiPost,
  apiPut,
  formatHeaders,
  throwWithMessage,
} from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { quietImport } from "@/lib/chunk-reload";
import { canRecordFeedback, shouldShowInstallFeedbackCard } from "@/lib/feedback";
import { format, formatDate, plural } from "@/lib/format";
import { generatePassword, passwordLengthFor } from "@/lib/generate-password";
import { logout } from "@/lib/logout";
import { passwordErrorMessages } from "@/lib/password-errors";
import { changedSettings, parseStringArray, writableSettings } from "@/lib/settings-payload";
import { getCategoryName, getToolDescription, getToolName } from "@/lib/tool-i18n";
import { cn, copyToClipboard } from "@/lib/utils";
import { useAnalyticsStore } from "@/stores/analytics-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useThemeStore } from "@/stores/theme-store";
import { AlertMessages } from "../common/alert-messages";
import { CopyFeedback } from "../common/copy-feedback";
import { OtterLogo } from "../common/otter-logo";
import { AdminInstallFeedbackCard } from "../feedback/admin-install-feedback-card";
import { FeedbackDialog } from "../feedback/feedback-dialog";
import { AiFeaturesSection } from "./ai-features-section";
import { TwoFactorSettings } from "./two-factor-settings";
import { UsageSection } from "./usage-section";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type Section =
  | "general"
  | "system"
  | "security"
  | "people"
  | "teams"
  | "roles"
  | "audit-log"
  | "usage"
  | "api-keys"
  | "ai-features"
  | "tools"
  | "about";

interface NavItem {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: Permission;
  requiredPermissions?: readonly Permission[];
  requiredAnyPermission?: readonly Permission[];
  authRequired?: boolean;
}

function useNavItems() {
  const { t } = useTranslation();
  return useMemo<NavItem[]>(
    () => [
      { id: "general", label: t.settings.nav.general, icon: Settings },
      {
        id: "system",
        label: t.settings.nav.systemSettings,
        icon: Monitor,
        requiredPermissions: ["settings:read", "settings:write"],
      },
      { id: "security", label: t.settings.nav.security, icon: Shield, authRequired: true },
      {
        id: "people",
        label: t.settings.nav.people,
        icon: Users,
        requiredPermission: "users:manage",
        authRequired: true,
      },
      {
        id: "teams",
        label: t.settings.nav.teams,
        icon: UsersRound,
        requiredPermission: "teams:manage",
        authRequired: true,
      },
      {
        id: "roles",
        label: t.settings.nav.roles,
        icon: Shield,
        requiredPermission: "audit:read",
        authRequired: true,
      },
      {
        id: "audit-log",
        label: t.settings.nav.auditLog,
        icon: FileText,
        requiredPermission: "audit:read",
      },
      {
        id: "usage",
        label: t.settings.nav.usage,
        icon: BarChart3,
        requiredPermission: "audit:read",
      },
      {
        id: "api-keys",
        label: t.settings.nav.apiKeys,
        icon: Key,
        requiredAnyPermission: ["apikeys:own", "apikeys:all"],
      },
      {
        id: "ai-features",
        label: t.settings.nav.aiFeatures,
        icon: Sparkles,
        requiredPermission: "features:manage",
      },
      {
        id: "tools",
        label: t.settings.nav.tools,
        icon: Wrench,
        requiredPermissions: ["settings:read", "settings:write"],
      },
      { id: "about", label: t.settings.nav.about, icon: Info },
    ],
    [t],
  );
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [section, setSection] = useState<Section>("general");
  const { hasPermission, authEnabled } = useAuth();
  const { t } = useTranslation();
  const isMobile = useMobile();
  const NAV_ITEMS = useNavItems();
  const dialogRef = useRef<HTMLDivElement>(null);
  const mobileDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open && !isMobile);
  useFocusTrap(mobileDialogRef, open && isMobile);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    const permitted =
      (!item.requiredPermission || hasPermission(item.requiredPermission)) &&
      (!item.requiredPermissions || item.requiredPermissions.every((p) => hasPermission(p))) &&
      (!item.requiredAnyPermission || item.requiredAnyPermission.some((p) => hasPermission(p)));
    return permitted && (!item.authRequired || authEnabled);
  });

  const activeSection: Section = visibleNavItems.some((item) => item.id === section)
    ? section
    : "general";

  useEffect(() => {
    if (activeSection !== section) {
      setSection(activeSection);
    }
  }, [activeSection, section]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  if (isMobile) {
    return (
      <div
        ref={mobileDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title-mobile"
        className="fixed inset-0 z-50 flex flex-col bg-background"
      >
        {/* Mobile header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <h2 id="settings-dialog-title-mobile" className="text-sm font-semibold text-foreground">
            {t.settings.heading}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label={t.a11y.closeSettings}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile pill strip nav */}
        <div className="flex overflow-x-auto gap-1 px-3 pb-2 scrollbar-none shrink-0">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0",
                activeSection === item.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Mobile content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSection === "general" && <GeneralSection />}
          {activeSection === "system" && <SystemSection />}
          {activeSection === "security" && <SecuritySection />}
          {activeSection === "people" && <PeopleSection />}
          {activeSection === "teams" && <TeamsSection />}
          {activeSection === "roles" && <RolesSection />}
          {activeSection === "audit-log" && <AuditLogSection />}
          {activeSection === "usage" && <UsageSection />}
          {activeSection === "api-keys" && <ApiKeysSection />}
          {activeSection === "ai-features" && <AiFeaturesSection />}
          {activeSection === "tools" && <ToolsSection />}

          {activeSection === "about" && <AboutSection />}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl h-[85dvh] flex overflow-hidden"
      >
        {/* Sidebar nav */}
        <div className="w-48 border-r border-border bg-muted/30 p-3 space-y-1 shrink-0">
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 id="settings-dialog-title" className="text-sm font-semibold text-foreground">
              {t.settings.heading}
            </h2>
          </div>
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                activeSection === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label={t.a11y.closeSettings}
          >
            <X className="h-4 w-4" />
          </button>

          {activeSection === "general" && <GeneralSection />}
          {activeSection === "system" && <SystemSection />}
          {activeSection === "security" && <SecuritySection />}
          {activeSection === "people" && <PeopleSection />}
          {activeSection === "teams" && <TeamsSection />}
          {activeSection === "roles" && <RolesSection />}
          {activeSection === "audit-log" && <AuditLogSection />}
          {activeSection === "usage" && <UsageSection />}
          {activeSection === "api-keys" && <ApiKeysSection />}
          {activeSection === "ai-features" && <AiFeaturesSection />}
          {activeSection === "tools" && <ToolsSection />}

          {activeSection === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────── Types ────────────────────── */

interface SessionUser {
  id: number;
  username: string;
  role: string;
}

interface ApiKeyEntry {
  id: number;
  name: string;
  prefix: string;
  createdAt: string;
  permissions: string[] | null;
  expiresAt: string | null;
}

interface RoleEntry {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isBuiltin: boolean;
  userCount: number;
}

interface UserEntry {
  id: string;
  username: string;
  role: string;
  team: string;
  authProvider?: string;
  email?: string;
  hasLocalPassword?: boolean;
  hasOidcLink?: boolean;
  createdAt: string;
}

interface TeamEntry {
  id: string;
  name: string;
  memberCount: number;
  storageQuota: number | null;
  retentionHours: number | null;
  createdAt: string;
}

/* ────────────────────── General ────────────────────── */

function readStoredUsername(): string {
  try {
    return localStorage.getItem("snapotter-username") || "";
  } catch {
    return "";
  }
}

export function GeneralSection() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const later = useTimeouts();
  const { authEnabled } = useAuth();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultToolView, setDefaultToolView] = useState<"sidebar" | "fullscreen">("sidebar");
  const [prefsLoadFailed, setPrefsLoadFailed] = useState(false);
  const [prefsRetrying, setPrefsRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [logoutFailed, setLogoutFailed] = useState(false);

  const loadPreferences = useCallback((retrying = false) => {
    if (retrying) setPrefsRetrying(true);
    return apiGet<{ preferences: Record<string, unknown> }>("/v1/preferences")
      .then((data) => {
        setDefaultToolView(
          data.preferences.defaultToolView === "fullscreen" ? "fullscreen" : "sidebar",
        );
        setPrefsLoadFailed(false);
      })
      .catch(() => {
        setPrefsLoadFailed(true);
      })
      .finally(() => {
        if (retrying) setPrefsRetrying(false);
      });
  }, []);

  useEffect(() => {
    Promise.all([
      apiGet<{ user: SessionUser }>("/auth/session")
        .then((data) => setUser(data.user))
        .catch(() => {
          setUser({
            id: 0,
            username: readStoredUsername(),
            // Empty, not "unknown": the render site falls back through
            // `user?.role || t.settings.general.roleUnknown`, and a truthy
            // English sentinel would bypass the translated label.
            role: "",
          });
        }),
      loadPreferences(),
    ]).finally(() => setLoading(false));
  }, [loadPreferences]);

  const handleLogout = async () => {
    setLogoutFailed(false);
    const destination = await logout();
    if (destination === null) {
      setLogoutFailed(true);
      return;
    }
    window.location.href = destination;
  };

  const handleSave = useCallback(async () => {
    if (prefsLoadFailed) return;
    setSaving(true);
    setSaveMsg(null);
    later.cancel("saveMsg");
    try {
      // The default home view is a per-user preference, not instance config, so
      // it saves to /v1/preferences (writable by any authenticated user) rather
      // than the admin-only /v1/settings.
      await apiPut("/v1/preferences", { defaultToolView });
      setSaveMsg({ type: "success", text: t.settings.general.saveSuccess });
      useSettingsStore.setState({
        defaultToolView,
      });
      later(() => setSaveMsg(null), 3000, "saveMsg");
    } catch (err) {
      later.cancel("saveMsg");
      setSaveMsg({
        type: "error",
        text: apiErrorMessage(t, err, {}, t.settings.general.saveFailed),
      });
    } finally {
      setSaving(false);
    }
  }, [defaultToolView, prefsLoadFailed, t, later]);

  const username = user?.username || "admin";
  const role = user?.role || t.settings.general.roleUnknown;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.general.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.general.description}</p>
      </div>

      {/* User info */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary-ink font-semibold">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              username.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <p className="font-medium text-foreground">{loading ? t.common.loading : username}</p>
            <p className="text-xs text-muted-foreground capitalize">{role}</p>
          </div>
        </div>
        {authEnabled && (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t.settings.general.logOut}
            </button>
            {logoutFailed && (
              <p role="alert" className="text-xs text-destructive">
                {t.auth.logoutFailed}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Default view */}
      <SettingRow
        label={t.settings.general.defaultToolViewLabel}
        description={t.settings.general.defaultToolViewDescription}
      >
        {prefsLoadFailed ? (
          prefsRetrying ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <LoadFailed
              inline
              message={t.settings.general.loadFailed}
              onRetry={() => void loadPreferences(true)}
            />
          )
        ) : (
          <select
            value={defaultToolView}
            onChange={(e) => {
              if (e.target.value === "sidebar" || e.target.value === "fullscreen") {
                setDefaultToolView(e.target.value);
              }
            }}
            aria-label={t.settings.general.defaultToolViewLabel}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
          >
            <option value="sidebar">{t.settings.general.sidebarOption}</option>
            <option value="fullscreen">{t.settings.general.fullscreenGridOption}</option>
          </select>
        )}
      </SettingRow>

      <SettingRow
        label={t.settings.system.languageLabel}
        description={t.settings.system.languageDescription}
      >
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          aria-label={t.settings.system.languageLabel}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
        >
          {supportedLocales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow
        label={t.settings.general.appVersionLabel}
        description={t.settings.general.appVersionDescription}
      >
        <span data-testid="app-version" className="text-sm font-mono text-muted-foreground">
          {APP_VERSION}
        </span>
      </SettingRow>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || prefsLoadFailed}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t.settings.general.saveButton}
        </button>
        {saveMsg && (
          <span
            role={saveMsg.type === "error" ? "alert" : "status"}
            className={cn(
              "text-sm inline-flex items-center gap-1.5",
              saveMsg.type === "error" ? "text-destructive" : "text-success-ink",
            )}
          >
            {saveMsg.text}
            {saveMsg.type === "error" && (
              <button
                type="button"
                onClick={() => {
                  setSaveMsg(null);
                  later.cancel("saveMsg");
                }}
                aria-label={t.common.close}
                className="p-0.5 rounded hover:bg-destructive/10 text-destructive shrink-0"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────── System ────────────────────── */

/** What the System tab calls each setting it saves, to name one the server refused. */
function systemSettingLabel(t: TranslationKeys, key: string): string | undefined {
  const labels: Partial<Record<string, string>> = {
    fileUploadLimitMb: t.settings.system.fileUploadLimitLabel,
    defaultTheme: t.settings.system.defaultThemeLabel,
    defaultLocale: t.settings.system.languageLabel,
    loginAttemptLimit: t.settings.system.loginAttemptLimitLabel,
    tempFileMaxAgeHours: t.settings.fileManagement.maxAge,
    startupCleanup: t.settings.fileManagement.startupCleanup,
    analyticsEnabled: t.settings.privacy.analyticsLabel,
    jobsRetentionDays: t.settings.dataRetention.jobsRetentionDays,
    auditRetentionDays: t.settings.dataRetention.auditRetentionDays,
  };
  return labels[key];
}

const VALID_DEFAULT_THEMES = new Set<string>(["light", "dark", "system"]);
const SUPPORTED_LOCALE_CODES = new Set<string>(SUPPORTED_LOCALES.map((l) => l.code));

export function SystemSection() {
  const { t } = useTranslation();
  const later = useTimeouts();
  const { role, hasPermission } = useAuth();
  const analyticsConfig = useAnalyticsStore((s) => s.config);
  const analyticsConfigLoaded = useAnalyticsStore((s) => s.configLoaded);
  const [settings, setSettings] = useState<Record<string, string>>({});
  // Snapshot of the last server state, so a save sends only the fields this tab
  // changed (never a stale value that could clobber another admin's concurrent edit).
  const originalSettingsRef = useRef<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [installFeedbackOpen, setInstallFeedbackOpen] = useState(false);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [installFeedbackError, setInstallFeedbackError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadSettings = useCallback(() => {
    setLoading(true);
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setSettings(data.settings);
        originalSettingsRef.current = data.settings;
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateInstallFeedbackState = useCallback(
    async (key: string, value: string) => {
      setInstallFeedbackError(null);
      later.cancel("installFeedbackError");
      try {
        await apiPut("/v1/settings", { [key]: value });
        setSettings((prev) => ({ ...prev, [key]: value }));
      } catch (error) {
        const statusCode = error instanceof ApiError ? error.status : undefined;
        void captureHandledError(
          new SafeError("Saving install feedback state failed", {
            kind: "operational",
            code: key,
            statusCode,
            cause: error,
          }),
          { error_class: "operational" },
        );
        later.cancel("installFeedbackError");
        setInstallFeedbackError(apiErrorMessage(t, error, {}, t.settings.system.saveFailed));
      }
    },
    [t, later],
  );

  const handleInstallFeedbackSubmitted = useCallback(
    (accepted: boolean) => {
      // A declined answer was not recorded, so keep the card eligible instead
      // of hiding it as if it had been submitted (#2252).
      if (!accepted) return;
      void updateInstallFeedbackState("feedback.install.submittedAt", new Date().toISOString());
    },
    [updateInstallFeedbackState],
  );

  const handleInstallFeedbackSnooze = useCallback(() => {
    const snoozedUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    void updateInstallFeedbackState("feedback.install.snoozedUntil", snoozedUntil);
  }, [updateInstallFeedbackState]);

  const handleInstallFeedbackDismiss = useCallback(() => {
    void updateInstallFeedbackState("feedback.install.dismissedAt", new Date().toISOString());
  }, [updateInstallFeedbackState]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    later.cancel("saveMsg");
    try {
      const changed = changedSettings(originalSettingsRef.current, settings);
      await apiPut("/v1/settings", writableSettings(changed));
      originalSettingsRef.current = { ...settings };
      if ("analyticsEnabled" in changed) {
        const { optIn, optOut } = await quietImport(() => import("@/lib/analytics"));
        if (settings.analyticsEnabled === "false") optOut();
        else optIn();
        // Refresh the cached config so this tab converges immediately: optOut()
        // stops the SDKs but leaves the store enabled, which would keep feedback
        // surfaces visible (and silently drop their submissions) until a refocus.
        useAnalyticsStore.getState().fetchConfig();
      }
      if (settings.defaultTheme && VALID_DEFAULT_THEMES.has(settings.defaultTheme)) {
        const theme = settings.defaultTheme as "light" | "dark" | "system";
        useThemeStore.getState().setTheme(theme);
      }
      setSaveMsg({ type: "success", text: t.settings.system.saveSuccess });
      later(() => setSaveMsg(null), 3000, "saveMsg");
    } catch (err) {
      later.cancel("saveMsg");
      // A refused value comes back with the setting's key: name its row and put
      // the row back where it was, so the tab doesn't keep showing a value the
      // server never accepted (and doesn't send it again on the next save).
      const refusedKey =
        err instanceof ApiError && typeof err.body.setting === "string"
          ? err.body.setting
          : undefined;
      if (refusedKey) {
        const saved = originalSettingsRef.current[refusedKey];
        setSettings((prev) => {
          if (saved === undefined) {
            const { [refusedKey]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [refusedKey]: saved };
        });
      }
      const refused = refusedKey ? systemSettingLabel(t, refusedKey) : undefined;
      setSaveMsg({
        type: "error",
        text: apiErrorMessage(
          t,
          err,
          {
            FEATURE_NOT_LICENSED: t.errors.featureNotLicensed,
            ESCALATION_DENIED: t.errors.escalationDenied,
            ...(refused && {
              VALIDATION_ERROR: format(t.errors.invalidSetting, { setting: refused }),
            }),
          },
          t.settings.system.saveFailed,
        ),
      });
    } finally {
      setSaving(false);
    }
  }, [settings, t, later]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Invented defaults read as the live configuration: a 90-day audit
  // retention would show as 0, "keep forever" (#1447).
  if (loadFailed) {
    return <LoadFailed message={t.settings.system.loadFailed} onRetry={loadSettings} />;
  }

  const installFeedbackVisible = shouldShowInstallFeedbackCard({
    settings,
    role,
    analyticsConfigLoaded,
    analyticsEnabled: canRecordFeedback(analyticsConfig),
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.system.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.system.description}</p>
      </div>

      <SettingRow
        label={t.settings.system.fileUploadLimitLabel}
        description={t.settings.system.fileUploadLimitDescription}
      >
        <SettingNumberInput
          value={settings.fileUploadLimitMb}
          fallback="100"
          onChange={(v) => updateSetting("fileUploadLimitMb", v)}
          aria-label={t.settings.system.fileUploadLimitLabel}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={1}
        />
      </SettingRow>

      <SettingRow
        label={t.settings.system.defaultThemeLabel}
        description={t.settings.system.defaultThemeDescription}
      >
        <select
          value={
            settings.defaultTheme && VALID_DEFAULT_THEMES.has(settings.defaultTheme)
              ? settings.defaultTheme
              : "system"
          }
          onChange={(e) => updateSetting("defaultTheme", e.target.value)}
          aria-label={t.settings.system.defaultThemeLabel}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
        >
          <option value="light">{t.settings.system.lightOption}</option>
          <option value="dark">{t.settings.system.darkOption}</option>
          <option value="system">{t.settings.system.systemOption}</option>
        </select>
      </SettingRow>

      <SettingRow
        label={t.settings.system.languageLabel}
        description={t.settings.system.languageDescription}
      >
        <select
          value={
            settings.defaultLocale && SUPPORTED_LOCALE_CODES.has(settings.defaultLocale)
              ? settings.defaultLocale
              : "en"
          }
          onChange={(e) => updateSetting("defaultLocale", e.target.value)}
          aria-label={t.settings.system.languageLabel}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
        >
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName}
            </option>
          ))}
        </select>
      </SettingRow>

      {hasPermission("security:manage") && (
        <SettingRow
          label={t.settings.system.loginAttemptLimitLabel}
          description={t.settings.system.loginAttemptLimitDescription}
        >
          <SettingNumberInput
            value={settings.loginAttemptLimit}
            fallback="5"
            onChange={(v) => updateSetting("loginAttemptLimit", v)}
            aria-label={t.settings.system.loginAttemptLimitLabel}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
            min={1}
            max={100}
          />
        </SettingRow>
      )}

      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground mb-3">
          {t.settings.fileManagement.title}
        </h4>
      </div>
      <SettingRow
        label={t.settings.fileManagement.maxAge}
        description={t.settings.fileManagement.maxAgeDescription}
      >
        <SettingNumberInput
          value={settings.tempFileMaxAgeHours}
          fallback="24"
          onChange={(v) => updateSetting("tempFileMaxAgeHours", v)}
          aria-label={t.settings.fileManagement.maxAge}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={1}
        />
      </SettingRow>
      <SettingRow
        label={t.settings.fileManagement.startupCleanup}
        description={t.settings.fileManagement.startupCleanupDescription}
      >
        <button
          type="button"
          role="switch"
          aria-checked={settings.startupCleanup !== "false"}
          aria-label={t.settings.fileManagement.startupCleanup}
          onClick={() =>
            updateSetting("startupCleanup", settings.startupCleanup === "false" ? "true" : "false")
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            settings.startupCleanup !== "false" ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              settings.startupCleanup !== "false" ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </SettingRow>

      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground mb-3">{t.settings.privacy.title}</h4>
        <p className="text-sm text-muted-foreground mb-3">{t.settings.privacy.description}</p>
      </div>
      <SettingRow
        label={t.settings.privacy.analyticsLabel}
        description={t.settings.privacy.analyticsDescription}
      >
        <button
          type="button"
          role="switch"
          aria-checked={settings.analyticsEnabled !== "false"}
          aria-label={t.settings.privacy.analyticsLabel}
          onClick={() =>
            updateSetting(
              "analyticsEnabled",
              settings.analyticsEnabled === "false" ? "true" : "false",
            )
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            settings.analyticsEnabled !== "false" ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              settings.analyticsEnabled !== "false" ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </SettingRow>

      <AdminInstallFeedbackCard
        visible={installFeedbackVisible}
        onShare={() => setInstallFeedbackOpen(true)}
        onRemindLater={handleInstallFeedbackSnooze}
        onDismissForever={handleInstallFeedbackDismiss}
      />
      {installFeedbackError && (
        <span
          role="alert"
          className="text-sm inline-flex items-center gap-1.5 text-destructive mt-2"
        >
          {installFeedbackError}
          <button
            type="button"
            onClick={() => {
              setInstallFeedbackError(null);
              later.cancel("installFeedbackError");
            }}
            aria-label={t.common.close}
            className="p-0.5 rounded hover:bg-destructive/10 text-destructive shrink-0"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      )}

      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground mb-3">
          {t.settings.dataRetention.title}
        </h4>
      </div>
      {/* NOTE: the temp-file TTL (tempFileMaxAgeHours) is configured once under
          File Management above. A second control here bound the same key with a
          different default, so editing either silently overwrote the other.
          Data Retention keeps only the DB-row retention controls below. */}
      <SettingRow
        label={t.settings.dataRetention.jobsRetentionDays}
        description={t.settings.dataRetention.jobsRetentionDaysDesc}
      >
        <SettingNumberInput
          value={settings.jobsRetentionDays}
          fallback="30"
          onChange={(v) => updateSetting("jobsRetentionDays", v)}
          aria-label={t.settings.dataRetention.jobsRetentionDays}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={0}
        />
      </SettingRow>
      {hasPermission("compliance:manage") && (
        <SettingRow
          label={t.settings.dataRetention.auditRetentionDays}
          description={t.settings.dataRetention.auditRetentionDaysDesc}
        >
          <SettingNumberInput
            value={settings.auditRetentionDays}
            fallback="0"
            onChange={(v) => updateSetting("auditRetentionDays", v)}
            aria-label={t.settings.dataRetention.auditRetentionDays}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
            min={0}
          />
        </SettingRow>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t.settings.system.saveButton}
        </button>
        {saveMsg && (
          <span
            role={saveMsg.type === "error" ? "alert" : "status"}
            className={cn(
              "text-sm inline-flex items-center gap-1.5",
              saveMsg.type === "error" ? "text-destructive" : "text-success-ink",
            )}
          >
            {saveMsg.text}
            {saveMsg.type === "error" && (
              <button
                type="button"
                onClick={() => {
                  setSaveMsg(null);
                  later.cancel("saveMsg");
                }}
                aria-label={t.common.close}
                className="p-0.5 rounded hover:bg-destructive/10 text-destructive shrink-0"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </div>

      {hasPermission("system:health") && (
        <div className="pt-4 border-t border-border">
          <SettingRow
            label={t.settings.system.supportBundleButton}
            description={t.settings.system.supportBundleDescription}
          >
            <button
              type="button"
              disabled={bundleLoading}
              onClick={async () => {
                setBundleLoading(true);
                setBundleError(null);
                try {
                  const res = await fetch(appUrl("/api/v1/admin/support-bundle"), {
                    headers: formatHeaders(),
                  });
                  if (!res.ok) await throwWithMessage(res);
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const cd = res.headers.get("Content-Disposition") || "";
                  const filenameMatch = cd.match(/filename=([^\s;]+)/);
                  a.download = filenameMatch ? filenameMatch[1] : "snapotter-support.zip";
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  if (err instanceof TypeError) {
                    useConnectionStore.getState().setDisconnected();
                  }
                  setBundleError(
                    apiErrorMessage(t, err, {}, t.settings.system.supportBundleFailed),
                  );
                } finally {
                  setBundleLoading(false);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {bundleLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {t.settings.system.supportBundleButton}
            </button>
          </SettingRow>
          {bundleError && <p className="text-sm text-destructive mt-2">{bundleError}</p>}
        </div>
      )}

      <FeedbackDialog
        open={installFeedbackOpen}
        source="admin_installer"
        onClose={() => setInstallFeedbackOpen(false)}
        onSubmitted={handleInstallFeedbackSubmitted}
      />
    </div>
  );
}

/* ────────────────────── Security ────────────────────── */

export function SecuritySection() {
  const { t } = useTranslation();
  const { hasPermission, hasLocalPassword, loading: authLoading } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // `messages` is a list because a password can break several policy rules at
  // once, and the server names them all (#2090).
  const [message, setMessage] = useState<{
    type: "success" | "error";
    messages: string[];
  } | null>(null);

  const handleChangePassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
        setMessage({ type: "error", messages: [t.settings.security.passwordsMismatch] });
        return;
      }
      setSubmitting(true);
      setMessage(null);
      try {
        await apiPost("/auth/change-password", { currentPassword, newPassword });
        setMessage({ type: "success", messages: [t.settings.security.changeSuccess] });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch (err) {
        // The server knows the password policy (the length rule included), so
        // its named rule answers here, in the user's language (#1445).
        const passwordMessages =
          err instanceof ApiError ? passwordErrorMessages(t, err.status, err.body) : [];
        setMessage({
          type: "error",
          messages:
            passwordMessages.length > 0
              ? passwordMessages
              : // Anything else keeps the reason in the console and gets the
                // shared mapping for a lost session or a denied request.
                [apiErrorMessage(t, err, {}, t.settings.security.changeFailed)],
        });
      } finally {
        setSubmitting(false);
      }
    },
    [currentPassword, newPassword, confirmPassword, t],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.security.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.security.description}</p>
      </div>

      {(authLoading || hasLocalPassword !== false) && (
        <form onSubmit={handleChangePassword} className="space-y-4">
          <h4 className="text-sm font-medium text-foreground">
            {t.settings.security.changePasswordHeading}
          </h4>

          <div className="space-y-3 max-w-sm">
            <div className="relative">
              <label htmlFor="current-password" className="sr-only">
                {t.settings.security.currentPasswordPlaceholder}
              </label>
              <input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t.settings.security.currentPasswordPlaceholder}
                className="w-full px-3 py-2 pe-10 rounded-lg border border-border bg-background text-sm text-foreground"
                required
                aria-invalid={message?.type === "error" || undefined}
                aria-describedby={message ? "password-change-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="relative">
              <label htmlFor="new-password" className="sr-only">
                {t.settings.security.newPasswordPlaceholder}
              </label>
              <input
                id="new-password"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t.settings.security.newPasswordPlaceholder}
                className="w-full px-3 py-2 pe-10 rounded-lg border border-border bg-background text-sm text-foreground"
                required
                aria-invalid={message?.type === "error" || undefined}
                aria-describedby={message ? "password-change-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="relative">
              <label htmlFor="confirm-password" className="sr-only">
                {t.settings.security.confirmPasswordPlaceholder}
              </label>
              <input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t.settings.security.confirmPasswordPlaceholder}
                className="w-full px-3 py-2 pe-10 rounded-lg border border-border bg-background text-sm text-foreground"
                required
                aria-invalid={message?.type === "error" || undefined}
                aria-describedby={message ? "password-change-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {message && (
              <AlertMessages
                id="password-change-error"
                messages={message.messages}
                className={cn(
                  "text-sm",
                  message.type === "error" ? "text-destructive" : "text-success-ink",
                )}
              />
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {t.settings.security.changePasswordButton}
            </button>
          </div>
        </form>
      )}

      <div className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{t.settings.security.loginAttemptLimitNote}</p>
      </div>

      <TwoFactorSettings />

      {hasPermission("settings:read") &&
        hasPermission("settings:write") &&
        hasPermission("security:manage") && <AdminSecuritySettings />}
    </div>
  );
}

/** What the Security tab calls each setting it saves, to name one the server refused. */
function securitySettingLabel(t: TranslationKeys, key: string): string | undefined {
  const labels: Partial<Record<string, string>> = {
    sessionIdleTimeoutMinutes: t.settings.security.sessionIdleTimeout,
    maxSessionsPerUser: t.settings.security.maxSessionsPerUser,
    mfaPolicy: t.settings.security.mfaPolicy,
    ssoEnforcement: t.settings.security.ssoEnforcement,
    ssoBreakGlassUsername: t.settings.security.ssoBreakGlassUsername,
    passwordMinLength: t.settings.security.passwordMinLength,
    passwordRequireUppercase: t.settings.security.passwordRequireUppercase,
    passwordRequireLowercase: t.settings.security.passwordRequireLowercase,
    passwordRequireDigit: t.settings.security.passwordRequireNumber,
    passwordRequireSpecial: t.settings.security.passwordRequireSpecial,
  };
  return labels[key];
}

const VALID_MFA_POLICIES = new Set<string>(["optional", "admins_only", "required"]);

export function AdminSecuritySettings() {
  const { t } = useTranslation();
  const later = useTimeouts();
  const [settings, setSettings] = useState<Record<string, string>>({});
  // Snapshot of the last server state; a save sends only the fields this tab changed
  // so an unrelated edit here can never echo (and revert) another admin's change,
  // such as an instance-wide analytics opt-out.
  const originalSettingsRef = useRef<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadSettings = useCallback(() => {
    setLoading(true);
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setSettings(data.settings);
        originalSettingsRef.current = data.settings;
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    later.cancel("saveMsg");
    try {
      await apiPut(
        "/v1/settings",
        writableSettings(changedSettings(originalSettingsRef.current, settings)),
      );
      originalSettingsRef.current = { ...settings };
      setSaveMsg({ type: "success", text: t.settings.security.securitySettingsSaved });
      later(() => setSaveMsg(null), 3000, "saveMsg");
    } catch (err) {
      later.cancel("saveMsg");
      // A refused value comes back with the setting's key: name its row and put
      // the row back where it was, so the tab doesn't keep showing a value the
      // server never accepted (and doesn't send it again on the next save).
      const refusedKey =
        err instanceof ApiError && typeof err.body.setting === "string"
          ? err.body.setting
          : undefined;
      if (refusedKey) {
        const saved = originalSettingsRef.current[refusedKey] ?? "";
        setSettings((prev) => ({ ...prev, [refusedKey]: saved }));
      }
      const refused = refusedKey ? securitySettingLabel(t, refusedKey) : undefined;
      setSaveMsg({
        type: "error",
        text: apiErrorMessage(
          t,
          err,
          {
            FEATURE_NOT_LICENSED: t.errors.featureNotLicensed,
            ESCALATION_DENIED: t.errors.escalationDenied,
            DEPENDENCY_VALIDATION_FAILED: t.settings.security.ssoNeedsProvider,
            ...(refused && {
              VALIDATION_ERROR: format(t.errors.invalidSetting, { setting: refused }),
            }),
          },
          t.settings.security.securitySettingsFailed,
        ),
      });
    } finally {
      setSaving(false);
    }
  }, [settings, t, later]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // A form full of defaults would misstate the live policy (MFA off, no
  // session limits), so a failed load shows only the failure (#1447).
  if (loadFailed) {
    return (
      <div className="border-t border-border pt-6">
        <LoadFailed message={t.settings.security.adminSettingsLoadFailed} onRetry={loadSettings} />
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-6 space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          {t.settings.security.adminHeading}
        </h4>
        <p className="text-xs text-muted-foreground mt-1">{t.settings.security.adminDescription}</p>
      </div>

      <SettingRow
        label={t.settings.security.sessionIdleTimeout}
        description={t.settings.security.sessionIdleTimeoutDesc}
      >
        <SettingNumberInput
          value={settings.sessionIdleTimeoutMinutes}
          fallback="0"
          onChange={(v) => updateSetting("sessionIdleTimeoutMinutes", v)}
          aria-label={t.settings.security.sessionIdleTimeout}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={0}
        />
      </SettingRow>

      <SettingRow
        label={t.settings.security.maxSessionsPerUser}
        description={t.settings.security.maxSessionsPerUserDesc}
      >
        <SettingNumberInput
          value={settings.maxSessionsPerUser}
          fallback="0"
          onChange={(v) => updateSetting("maxSessionsPerUser", v)}
          aria-label={t.settings.security.maxSessionsPerUser}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={0}
        />
      </SettingRow>

      <SettingRow
        label={t.settings.security.mfaPolicy}
        description={t.settings.security.mfaPolicyDesc}
      >
        <select
          value={
            settings.mfaPolicy && VALID_MFA_POLICIES.has(settings.mfaPolicy)
              ? settings.mfaPolicy
              : "optional"
          }
          onChange={(e) => updateSetting("mfaPolicy", e.target.value)}
          aria-label={t.settings.security.mfaPolicy}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
        >
          <option value="optional">{t.settings.security.mfaPolicyOptional}</option>
          <option value="admins_only">{t.settings.security.mfaPolicyAdminsOnly}</option>
          <option value="required">{t.settings.security.mfaPolicyRequired}</option>
        </select>
      </SettingRow>

      <SettingRow
        label={t.settings.security.ssoEnforcement}
        description={t.settings.security.ssoEnforcementDesc}
      >
        <button
          type="button"
          role="switch"
          aria-checked={settings.ssoEnforcement === "true"}
          aria-label={t.settings.security.ssoEnforcement}
          onClick={() =>
            updateSetting("ssoEnforcement", settings.ssoEnforcement === "true" ? "false" : "true")
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            settings.ssoEnforcement === "true" ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              settings.ssoEnforcement === "true" ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </SettingRow>

      {settings.ssoEnforcement === "true" && (
        <SettingRow
          label={t.settings.security.ssoBreakGlassUsername}
          description={t.settings.security.ssoBreakGlassUsernameDesc}
        >
          <input
            type="text"
            value={settings.ssoBreakGlassUsername || ""}
            onChange={(e) => updateSetting("ssoBreakGlassUsername", e.target.value)}
            aria-label={t.settings.security.ssoBreakGlassUsername}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-40"
            placeholder="admin"
          />
        </SettingRow>
      )}

      <div className="pt-2 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground mb-3">
          {t.settings.security.passwordPolicyHeading}
        </h4>
      </div>

      <SettingRow
        label={t.settings.security.passwordMinLength}
        description={t.settings.security.passwordMinLengthDesc}
      >
        <SettingNumberInput
          value={settings.passwordMinLength}
          fallback="8"
          onChange={(v) => updateSetting("passwordMinLength", v)}
          aria-label={t.settings.security.passwordMinLength}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={1}
          max={128}
        />
      </SettingRow>

      <SettingRow
        label={t.settings.security.passwordRequireUppercase}
        description={t.settings.security.passwordRequireUppercaseDesc}
      >
        <button
          type="button"
          role="switch"
          aria-checked={isPasswordRuleEnabled(
            "passwordRequireUppercase",
            settings.passwordRequireUppercase,
          )}
          aria-label={t.settings.security.passwordRequireUppercase}
          onClick={() =>
            updateSetting(
              "passwordRequireUppercase",
              isPasswordRuleEnabled("passwordRequireUppercase", settings.passwordRequireUppercase)
                ? "false"
                : "true",
            )
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            isPasswordRuleEnabled("passwordRequireUppercase", settings.passwordRequireUppercase)
              ? "bg-primary"
              : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              isPasswordRuleEnabled("passwordRequireUppercase", settings.passwordRequireUppercase)
                ? "translate-x-6"
                : "translate-x-1",
            )}
          />
        </button>
      </SettingRow>

      <SettingRow
        label={t.settings.security.passwordRequireLowercase}
        description={t.settings.security.passwordRequireLowercaseDesc}
      >
        <button
          type="button"
          role="switch"
          aria-checked={isPasswordRuleEnabled(
            "passwordRequireLowercase",
            settings.passwordRequireLowercase,
          )}
          aria-label={t.settings.security.passwordRequireLowercase}
          onClick={() =>
            updateSetting(
              "passwordRequireLowercase",
              isPasswordRuleEnabled("passwordRequireLowercase", settings.passwordRequireLowercase)
                ? "false"
                : "true",
            )
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            isPasswordRuleEnabled("passwordRequireLowercase", settings.passwordRequireLowercase)
              ? "bg-primary"
              : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              isPasswordRuleEnabled("passwordRequireLowercase", settings.passwordRequireLowercase)
                ? "translate-x-6"
                : "translate-x-1",
            )}
          />
        </button>
      </SettingRow>

      <SettingRow
        label={t.settings.security.passwordRequireNumber}
        description={t.settings.security.passwordRequireNumberDesc}
      >
        <button
          type="button"
          role="switch"
          aria-checked={isPasswordRuleEnabled(
            "passwordRequireDigit",
            settings.passwordRequireDigit,
          )}
          aria-label={t.settings.security.passwordRequireNumber}
          onClick={() =>
            updateSetting(
              "passwordRequireDigit",
              isPasswordRuleEnabled("passwordRequireDigit", settings.passwordRequireDigit)
                ? "false"
                : "true",
            )
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            isPasswordRuleEnabled("passwordRequireDigit", settings.passwordRequireDigit)
              ? "bg-primary"
              : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              isPasswordRuleEnabled("passwordRequireDigit", settings.passwordRequireDigit)
                ? "translate-x-6"
                : "translate-x-1",
            )}
          />
        </button>
      </SettingRow>

      <SettingRow
        label={t.settings.security.passwordRequireSpecial}
        description={t.settings.security.passwordRequireSpecialDesc}
      >
        <button
          type="button"
          role="switch"
          aria-checked={isPasswordRuleEnabled(
            "passwordRequireSpecial",
            settings.passwordRequireSpecial,
          )}
          aria-label={t.settings.security.passwordRequireSpecial}
          onClick={() =>
            updateSetting(
              "passwordRequireSpecial",
              isPasswordRuleEnabled("passwordRequireSpecial", settings.passwordRequireSpecial)
                ? "false"
                : "true",
            )
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            isPasswordRuleEnabled("passwordRequireSpecial", settings.passwordRequireSpecial)
              ? "bg-primary"
              : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              isPasswordRuleEnabled("passwordRequireSpecial", settings.passwordRequireSpecial)
                ? "translate-x-6"
                : "translate-x-1",
            )}
          />
        </button>
      </SettingRow>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t.settings.system.saveButton}
        </button>
        {saveMsg && (
          <span
            role={saveMsg.type === "error" ? "alert" : "status"}
            className={cn(
              "text-sm inline-flex items-center gap-1.5",
              saveMsg.type === "error" ? "text-destructive" : "text-success-ink",
            )}
          >
            {saveMsg.text}
            {saveMsg.type === "error" && (
              <button
                type="button"
                onClick={() => {
                  setSaveMsg(null);
                  later.cancel("saveMsg");
                }}
                aria-label={t.common.close}
                className="p-0.5 rounded hover:bg-destructive/10 text-destructive shrink-0"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────── People ────────────────────── */

export function PeopleSection() {
  const { t } = useTranslation();
  const later = useTimeouts();
  const isMobile = useMobile();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [maxUsers, setMaxUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [newTeam, setNewTeam] = useState("Default");
  const [addErrors, setAddErrors] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [showGeneratedPw, setShowGeneratedPw] = useState(false);
  const [pwCopy, setPwCopy] = useState<"copied" | "failed" | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserEntry | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [resetPasswordUser, setResetPasswordUser] = useState<UserEntry | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  // Drops responses from in-flight reset requests when the form moves (#2066).
  const resetEpochRef = useRef(0);
  // Why the server refused the password, shown in the reset form until the next
  // edit; the banner's three seconds are too easy to miss (#2025).
  const [resetErrors, setResetErrors] = useState<string[] | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [availableRoles, setAvailableRoles] = useState<RoleEntry[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  // The server's minimum password length, so Generate can meet it (#2027). Like
  // the team and role lists it only feeds a convenience. The key is readable
  // with security:manage, so an admin without it gets a 403 or a settings map
  // that leaves it out, and Generate keeps its default length until the server
  // names the minimum in a refusal.
  const [policyMinLength, setPolicyMinLength] = useState<unknown>(undefined);

  const loadPolicy = useCallback(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => setPolicyMinLength(data.settings?.passwordMinLength))
      .catch((err) => {
        // A 403 FORBIDDEN is the expected answer for an admin without access.
        if (err instanceof ApiError && err.code === "FORBIDDEN") return;
        console.warn("Password policy read failed; Generate uses the default length", err);
      });
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      const data = await apiGet<{ teams: TeamEntry[] }>("/v1/teams");
      setTeams(data.teams);
    } catch (err) {
      setTeams([]);
      if (err instanceof ApiError && err.code === "FORBIDDEN") return;
      console.warn("Team list read failed; People picker uses Default", err);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiGet<{ users: UserEntry[]; maxUsers: number }>("/auth/users");
      setUsers(data.users);
      setMaxUsers(data.maxUsers);
      setLoadFailed(false);
    } catch {
      setUsers([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // The team and role lists only feed the pickers, which fall back to Default
  // and the built-in roles: those endpoints need teams:manage and audit:read,
  // which a users:manage admin may not have, so their failure isn't the
  // section's (#1447).
  const loadRoles = useCallback(async () => {
    try {
      const data = await apiGet<{ roles: RoleEntry[] }>("/v1/roles");
      setAvailableRoles(data.roles);
    } catch (err) {
      setAvailableRoles([]);
      if (err instanceof ApiError && err.code === "FORBIDDEN") return;
      console.warn("Role list read failed; People picker uses built-in roles", err);
    }
  }, []);

  const loadAll = useCallback(() => {
    loadUsers();
    loadTeams();
    loadRoles();
    loadPolicy();
  }, [loadUsers, loadTeams, loadRoles, loadPolicy]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [openMenuId]);

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase()),
  );

  const atLimit = maxUsers > 0 && users.length >= maxUsers;

  const handleAddUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAddErrors(null);
      setActionMsg(null);
      later.cancel("actionMsg");
      // The server's refusal names no rule, so check here and say which (#1445).
      if (!isValidUsername(newUsername)) {
        setAddErrors([t.settings.people.usernameInvalid]);
        return;
      }
      setAdding(true);
      try {
        await apiPost("/auth/register", {
          username: newUsername,
          password: newPassword,
          role: newRole,
          team: newTeam,
        });
        setNewUsername("");
        setNewPassword("");
        setNewRole("user");
        setNewTeam("Default");
        setShowAddForm(false);
        setShowGeneratedPw(false);
        setPwCopy(null);
        setActionMsg({ type: "success", text: t.settings.people.createSuccess });
        later(() => setActionMsg(null), 3000, "actionMsg");
        await loadUsers();
      } catch (err) {
        // The refusal names the minimum even when the policy read didn't, so
        // the next Generate meets it (#2027).
        if (err instanceof ApiError && typeof err.body.minLength === "number") {
          setPolicyMinLength(err.body.minLength);
        }
        // Every rule the password broke, since the server lists them (#2090).
        const passwordMessages =
          err instanceof ApiError ? passwordErrorMessages(t, err.status, err.body) : [];
        setAddErrors(
          passwordMessages.length > 0
            ? passwordMessages
            : [
                apiErrorMessage(
                  t,
                  err,
                  {
                    USER_LIMIT_REACHED: format(t.settings.people.userLimitReached, {
                      max: maxUsers,
                    }),
                    CONFLICT: t.settings.people.usernameTaken,
                    UNKNOWN_ROLE: t.settings.people.roleNotFound,
                    UNKNOWN_TEAM: t.settings.people.teamNotFound,
                    ESCALATION_DENIED: t.errors.escalationDenied,
                  },
                  t.settings.people.createFailed,
                ),
              ],
        );
      } finally {
        setAdding(false);
      }
    },
    [newUsername, newPassword, newRole, newTeam, maxUsers, loadUsers, t, later],
  );

  const handleDeleteUser = useCallback(
    async (id: string, username: string) => {
      if (!confirm(format(t.settings.people.deleteConfirm, { username }))) return;
      setActionMsg(null);
      later.cancel("actionMsg");
      try {
        await apiDelete(`/auth/users/${id}`);
        setActionMsg({
          type: "success",
          text: format(t.settings.people.deleteSuccess, { username }),
        });
        later(() => setActionMsg(null), 3000, "actionMsg");
        await loadUsers();
      } catch (err) {
        later.cancel("actionMsg");
        setActionMsg({
          type: "error",
          text: apiErrorMessage(
            t,
            err,
            {
              SELF_DELETE: t.settings.people.cannotDeleteSelf,
              LAST_ADMIN: t.settings.people.lastAdmin,
              ESCALATION_DENIED: t.errors.escalationDenied,
            },
            t.settings.people.deleteFailed,
          ),
        });
      }
      setOpenMenuId(null);
    },
    [loadUsers, t, later],
  );

  const handleUpdateUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUser) return;
      setActionMsg(null);
      later.cancel("actionMsg");
      try {
        await apiPut(`/auth/users/${editingUser.id}`, {
          role: editRole,
          team: editTeam,
        });
        setEditingUser(null);
        setActionMsg({ type: "success", text: t.settings.people.updateSuccess });
        later(() => setActionMsg(null), 3000, "actionMsg");
        await loadUsers();
      } catch (err) {
        later.cancel("actionMsg");
        setActionMsg({
          type: "error",
          text: apiErrorMessage(
            t,
            err,
            {
              SELF_DEMOTE: t.settings.people.cannotRemoveOwnAdmin,
              LAST_ADMIN: t.settings.people.lastAdmin,
              UNKNOWN_ROLE: t.settings.people.roleNotFound,
              UNKNOWN_TEAM: t.settings.people.teamNotFound,
              ESCALATION_DENIED: t.errors.escalationDenied,
            },
            t.settings.people.updateFailed,
          ),
        });
      }
    },
    [editingUser, editRole, editTeam, loadUsers, t, later],
  );

  const handleResetPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resetPasswordUser || resetting) return;
      const targetUser = resetPasswordUser;
      const targetPassword = resetPassword;
      const epoch = ++resetEpochRef.current;
      setResetting(true);
      setResetErrors(null);
      setActionMsg(null);
      later.cancel("actionMsg");
      try {
        await apiPost(`/auth/users/${targetUser.id}/reset-password`, {
          newPassword: targetPassword,
        });
        if (epoch !== resetEpochRef.current) return;
        setResetPasswordUser(null);
        setResetPassword("");
        setActionMsg({ type: "success", text: t.settings.people.resetSuccess });
        later(() => setActionMsg(null), 3000, "actionMsg");
      } catch (err) {
        if (epoch !== resetEpochRef.current) return;
        // A password the policy refuses belongs next to the field. Anything
        // else (a denied escalation, a rate limit, a server fault) is about the
        // request, not the value: editing the password can't fix it, so it
        // keeps the banner.
        const passwordMessages =
          err instanceof ApiError && err.code === "VALIDATION_ERROR"
            ? passwordErrorMessages(t, err.status, err.body)
            : [];
        if (passwordMessages.length > 0) {
          setResetErrors(passwordMessages);
          // The banner may still hold the last submit's outcome.
          setActionMsg(null);
          later.cancel("actionMsg");
        } else {
          later.cancel("actionMsg");
          setActionMsg({
            type: "error",
            text: apiErrorMessage(
              t,
              err,
              {
                ESCALATION_DENIED: t.errors.escalationDenied,
                OIDC_NO_PASSWORD: t.auth.passwordManagedByProvider,
              },
              t.settings.people.resetFailed,
            ),
          });
        }
      } finally {
        if (epoch === resetEpochRef.current) {
          setResetting(false);
        }
      }
    },
    [resetPasswordUser, resetPassword, resetting, t, later],
  );

  // A picker whose list fell back (built-in roles, Default) may not hold the
  // user's current role or team, and a select whose value isn't an option
  // shows the first one: the admin would read the wrong value, and "changing"
  // to it would save nothing yet report success. Always offer the current one.
  const editRoleListed =
    availableRoles.length > 0
      ? availableRoles.some((r) => r.name === editRole)
      : ["user", "editor", "admin"].includes(editRole);
  const editTeamListed =
    teams.length > 0 ? teams.some((tm) => tm.name === editTeam) : editTeam === "Default";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.people.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.people.description}</p>
      </div>

      {/* User count: none when the list didn't load, rather than a made-up 0 */}
      {!loadFailed && (
        <p className="text-sm text-muted-foreground">
          {maxUsers > 0
            ? `${users.length} / ${maxUsers} ${plural(maxUsers, format(t.settings.people.userCount, { count: "" }), format(t.settings.people.userCountPlural, { count: "" })).trim()}`
            : plural(
                users.length,
                format(t.settings.people.userCount, { count: users.length }),
                format(t.settings.people.userCountPlural, { count: users.length }),
              )}
        </p>
      )}

      {/* Action message */}
      {actionMsg && (
        <div
          role={actionMsg.type === "error" ? "alert" : "status"}
          className={cn(
            "text-sm px-3 py-2 rounded-lg flex items-center justify-between gap-2",
            actionMsg.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-success-ink",
          )}
        >
          <span>{actionMsg.text}</span>
          {actionMsg.type === "error" && (
            <button
              type="button"
              onClick={() => {
                setActionMsg(null);
                later.cancel("actionMsg");
              }}
              aria-label={t.common.close}
              className="p-0.5 rounded hover:bg-destructive/20 text-destructive shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Search + Add Members */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.settings.people.searchPlaceholder}
            className="w-full ps-9 pe-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAddForm(!showAddForm);
            setAddErrors(null);
          }}
          disabled={atLimit && !showAddForm}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            atLimit && !showAddForm
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          title={
            atLimit
              ? format(t.settings.people.userLimitReached, { max: maxUsers })
              : t.settings.people.addMembersButton
          }
        >
          <UserPlus className="h-4 w-4" />
          {t.settings.people.addMembersButton}
        </button>
      </div>

      {/* Add user form */}
      {showAddForm && (
        <form
          onSubmit={handleAddUser}
          className="p-4 rounded-lg border border-border bg-muted/20 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">
            {t.settings.people.newMemberHeading}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-user-username" className="sr-only">
                {t.settings.people.usernamePlaceholder}
              </label>
              <input
                id="new-user-username"
                type="text"
                value={newUsername}
                onChange={(e) => {
                  setNewUsername(e.target.value);
                  setAddErrors(null);
                }}
                placeholder={t.settings.people.usernamePlaceholder}
                required
                aria-invalid={Boolean(addErrors) || undefined}
                aria-describedby={addErrors ? "add-user-error" : undefined}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="new-user-password" className="sr-only">
                {t.auth.password}
              </label>
              <input
                id="new-user-password"
                type={showGeneratedPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setShowGeneratedPw(false);
                  setPwCopy(null);
                  setAddErrors(null);
                }}
                placeholder={t.auth.password}
                required
                aria-invalid={Boolean(addErrors) || undefined}
                aria-describedby={addErrors ? "add-user-error" : undefined}
                className={cn(
                  "flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground",
                  showGeneratedPw && "font-mono",
                )}
              />
              {showGeneratedPw && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(newPassword);
                      setPwCopy(ok ? "copied" : "failed");
                      later(() => setPwCopy(null), 2000, "pwCopy");
                    }}
                    className={cn(
                      "shrink-0 p-2 rounded-lg border border-border transition-colors",
                      pwCopy === "copied"
                        ? "text-success-ink bg-green-500/10"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    title={
                      pwCopy === "copied"
                        ? t.settings.people.passwordCopied
                        : pwCopy === "failed"
                          ? t.common.copyFailed
                          : t.settings.people.copyPasswordButton
                    }
                  >
                    {pwCopy === "copied" ? (
                      <Check className="h-4 w-4" />
                    ) : pwCopy === "failed" ? (
                      <X className="h-4 w-4 text-destructive" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <CopyFeedback status={pwCopy} />
                </>
              )}
            </div>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            >
              {availableRoles.length > 0 ? (
                availableRoles.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name.charAt(0).toUpperCase() + r.name.slice(1)} —{" "}
                    {r.description || t.settings.people.noDescription}
                  </option>
                ))
              ) : (
                <>
                  <option value="user">{t.settings.people.roleUserDescription}</option>
                  <option value="editor">{t.settings.people.roleEditorDescription}</option>
                  <option value="admin">{t.settings.people.roleAdminDescription}</option>
                </>
              )}
            </select>
            <select
              value={newTeam}
              onChange={(e) => setNewTeam(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            >
              {teams.map((tm) => (
                <option key={tm.id} value={tm.name}>
                  {tm.name}
                </option>
              ))}
              {teams.length === 0 && (
                <option value="Default">{t.settings.people.defaultTeamOption}</option>
              )}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={adding || atLimit}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {t.common.create}
            </button>
            <button
              type="button"
              onClick={() => {
                const pw = generatePassword(passwordLengthFor(policyMinLength));
                setNewPassword(pw);
                setShowGeneratedPw(true);
                setPwCopy(null);
                setAddErrors(null);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary/10 text-xs text-primary-ink hover:bg-primary/20 font-medium transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              {t.changePassword.generateButton}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setShowGeneratedPw(false);
                setPwCopy(null);
                // Reset the field values too, so re-opening the form is clean.
                setNewUsername("");
                setNewPassword("");
                setAddErrors(null);
              }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
          {showGeneratedPw && pwCopy !== "copied" && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 shrink-0" />
              {t.settings.people.copyPasswordWarning}
            </p>
          )}
          {addErrors && (
            <AlertMessages
              id="add-user-error"
              messages={addErrors}
              className="text-sm text-destructive"
            />
          )}
        </form>
      )}

      {editingUser && (
        <form
          onSubmit={handleUpdateUser}
          className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">
            {t.common.edit} {editingUser.username}
          </h4>
          <div className="flex flex-wrap gap-3">
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            >
              {!editRoleListed && <option value={editRole}>{editRole}</option>}
              {availableRoles.length > 0 ? (
                availableRoles.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name.charAt(0).toUpperCase() + r.name.slice(1)} —{" "}
                    {r.description || t.settings.people.noDescription}
                  </option>
                ))
              ) : (
                <>
                  <option value="user">{t.settings.people.roleUserDescription}</option>
                  <option value="editor">{t.settings.people.roleEditorDescription}</option>
                  <option value="admin">{t.settings.people.roleAdminDescription}</option>
                </>
              )}
            </select>
            <select
              value={editTeam}
              onChange={(e) => setEditTeam(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground w-40"
            >
              {!editTeamListed && <option value={editTeam}>{editTeam}</option>}
              {teams.map((tm) => (
                <option key={tm.id} value={tm.name}>
                  {tm.name}
                </option>
              ))}
              {teams.length === 0 && (
                <option value="Default">{t.settings.people.defaultTeamOption}</option>
              )}
            </select>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t.common.save}
            </button>
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      )}

      {resetPasswordUser && (
        <form
          onSubmit={handleResetPassword}
          className="p-4 rounded-lg border border-orange-500/30 bg-orange-500/5 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">
            {format(t.settings.people.resetPasswordHeading, {
              username: resetPasswordUser.username,
            })}
          </h4>
          <div className="flex flex-wrap gap-3">
            <label htmlFor="reset-user-password" className="sr-only">
              {t.settings.people.newPasswordLabel}
            </label>
            <input
              id="reset-user-password"
              type="password"
              value={resetPassword}
              disabled={resetting}
              onChange={(e) => {
                setResetPassword(e.target.value);
                setResetErrors(null);
              }}
              placeholder={t.settings.people.newPasswordLabel}
              required
              aria-invalid={Boolean(resetErrors) || undefined}
              aria-describedby={resetErrors ? "reset-password-error" : undefined}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground w-60 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={resetting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50"
            >
              {resetting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {t.settings.people.resetPasswordButton}
            </button>
            <button
              type="button"
              onClick={() => {
                resetEpochRef.current += 1;
                setResetting(false);
                setResetPasswordUser(null);
                setResetPassword("");
                setResetErrors(null);
              }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
          {resetErrors && (
            <AlertMessages
              id="reset-password-error"
              messages={resetErrors}
              className="text-sm text-destructive"
            />
          )}
          <p className="text-xs text-muted-foreground">{t.settings.people.resetPasswordWarning}</p>
        </form>
      )}

      {/* Users table */}
      <div className="border border-border rounded-lg">
        {/* Table header (desktop only) */}
        {!isMobile && (
          <div className="grid grid-cols-[1fr_100px_120px_60px] gap-2 px-4 py-2.5 bg-muted/40 rounded-t-lg border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>{t.settings.people.tableHeaderUser}</span>
            <span>{t.settings.people.tableHeaderRole}</span>
            <span>{t.settings.people.tableHeaderTeam}</span>
            <span />
          </div>
        )}

        {/* Table rows */}
        {loadFailed ? (
          <LoadFailed
            message={t.settings.people.loadFailed}
            onRetry={() => {
              setLoading(true);
              loadAll();
            }}
          />
        ) : filteredUsers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground rounded-b-lg">
            {search ? t.settings.people.noSearchResults : t.settings.people.noUsersFound}
          </div>
        ) : (
          filteredUsers.map((u) => (
            <div
              key={u.id}
              className={cn(
                "items-center px-4 py-3 border-b border-border last:border-0 last:rounded-b-lg hover:bg-muted/20 transition-colors",
                isMobile ? "flex gap-3" : "grid grid-cols-[1fr_100px_120px_60px] gap-2",
              )}
            >
              {isMobile ? (
                <>
                  {/* Mobile card layout */}
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary-ink font-semibold text-sm shrink-0">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate">
                        {u.username}
                      </span>
                      {u.hasOidcLink && u.hasLocalPassword !== false && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {t.auth.methodBoth}
                        </span>
                      )}
                      {u.hasOidcLink && u.hasLocalPassword === false && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {t.auth.methodOidc}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide",
                          u.role === "admin"
                            ? "bg-primary/15 text-primary-ink"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {u.role}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{u.team}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Desktop row layout */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary-ink font-semibold text-sm shrink-0">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">
                      {u.username}
                    </span>
                    {u.hasOidcLink && u.hasLocalPassword !== false && (
                      <span className="ms-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {t.auth.methodBoth}
                      </span>
                    )}
                    {u.hasOidcLink && u.hasLocalPassword === false && (
                      <span className="ms-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {t.auth.methodOidc}
                      </span>
                    )}
                  </div>

                  {/* Role badge */}
                  <div>
                    <span
                      className={cn(
                        "inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide",
                        u.role === "admin"
                          ? "bg-primary/15 text-primary-ink"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {u.role}
                    </span>
                  </div>

                  {/* Team */}
                  <span className="text-sm text-foreground truncate">{u.team}</span>
                </>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 justify-end relative shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === u.id ? null : u.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={t.common.actions}
                  aria-label={t.common.actions}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {/* Dropdown menu */}
                {openMenuId === u.id && (
                  <div
                    role="menu"
                    className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-border bg-background shadow-lg py-1"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(u);
                        setEditRole(u.role);
                        setEditTeam(u.team);
                        setOpenMenuId(null);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t.settings.people.editRoleTeamAction}
                    </button>
                    {u.hasLocalPassword !== false && (
                      <button
                        type="button"
                        onClick={() => {
                          resetEpochRef.current += 1;
                          setResetting(false);
                          setResetPasswordUser(u);
                          setResetPassword("");
                          setResetErrors(null);
                          setOpenMenuId(null);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t.settings.people.resetPasswordAction}
                      </button>
                    )}
                    <div className="border-t border-border my-1" />
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u.id, u.username)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.settings.people.deleteUserAction}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ────────────────────── API Keys ────────────────────── */

export function ApiKeysSection() {
  const { t, locale } = useTranslation();
  const later = useTimeouts();
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [showScoping, setShowScoping] = useState(false);
  const [scopedPerms, setScopedPerms] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { permissions } = useAuth();

  const loadKeys = useCallback(async () => {
    try {
      const data = await apiGet<{ apiKeys: ApiKeyEntry[] }>("/v1/api-keys");
      setKeys(data.apiKeys);
      setLoadFailed(false);
    } catch {
      setKeys([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const generateKey = useCallback(async () => {
    setNewKey(null);
    setError(null);
    let expiresAtIso: string | undefined;
    if (expiresAt) {
      const parsedExpiry = new Date(expiresAt);
      if (Number.isNaN(parsedExpiry.getTime()) || parsedExpiry.getTime() <= Date.now()) {
        setError(t.settings.apiKeys.expiresInPast);
        return;
      }
      expiresAtIso = parsedExpiry.toISOString();
    }
    setGenerating(true);
    try {
      const payload: Record<string, unknown> = { name: keyName || "default" };
      if (showScoping && scopedPerms.length > 0) {
        payload.permissions = scopedPerms;
      }
      if (expiresAtIso) {
        payload.expiresAt = expiresAtIso;
      }
      const data = await apiPost<{ key: string }>("/v1/api-keys", payload);
      setNewKey(data.key);
      // The last key's Copied or Copy failed is not this key's.
      setCopyStatus(null);
      setKeyName("");
      setScopedPerms([]);
      setShowScoping(false);
      setExpiresAt("");
      await loadKeys();
    } catch (err) {
      setError(
        apiErrorMessage(
          t,
          err,
          {
            ...(expiresAtIso && {
              VALIDATION_ERROR: t.settings.apiKeys.expiresInPast,
            }),
          },
          t.common.somethingWentWrong,
        ),
      );
    } finally {
      setGenerating(false);
    }
  }, [keyName, showScoping, scopedPerms, expiresAt, loadKeys, t]);

  const copyKey = useCallback(
    async (key: string) => {
      const ok = await copyToClipboard(key);
      setCopyStatus(ok ? "copied" : "failed");
      later(() => setCopyStatus(null), 2000, "copyStatus");
    },
    [later],
  );

  const deleteKey = useCallback(
    async (id: number) => {
      if (!confirm(t.settings.apiKeys.deleteConfirm)) return;
      setError(null);
      try {
        await apiDelete(`/v1/api-keys/${id}`);
        await loadKeys();
      } catch (err) {
        setError(apiErrorMessage(t, err, {}, t.common.somethingWentWrong));
      }
    },
    [loadKeys, t],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.apiKeys.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.apiKeys.description}</p>
      </div>

      {/* Generate new key */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder={t.settings.apiKeys.keyNamePlaceholder}
          aria-label={t.settings.apiKeys.keyNamePlaceholder}
          maxLength={100}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground w-48"
        />
        <button
          type="button"
          onClick={generateKey}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Key className="h-4 w-4" aria-hidden="true" />
          )}
          {t.settings.apiKeys.generateButton}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Permission scoping */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowScoping(!showScoping)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showScoping
            ? t.settings.apiKeys.removeScopingLabel
            : t.settings.apiKeys.restrictPermissionsLabel}
        </button>

        {showScoping && (
          <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-muted/20">
            {permissions.map((perm) => (
              <label key={perm} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopedPerms.includes(perm)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setScopedPerms([...scopedPerms, perm]);
                    } else {
                      setScopedPerms(scopedPerms.filter((p) => p !== perm));
                    }
                  }}
                  className="rounded border-border"
                />
                <span className="font-mono">{perm}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Expiration date */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          {t.settings.apiKeys.expiresLabel}
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="px-2 py-1 rounded border border-border bg-background text-xs text-foreground"
            min={new Date(Date.now() + 60_000 - new Date().getTimezoneOffset() * 60_000)
              .toISOString()
              .slice(0, 16)}
          />
        </label>
        {expiresAt && (
          <button
            type="button"
            onClick={() => setExpiresAt("")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t.settings.apiKeys.clearButton}
          </button>
        )}
      </div>

      {/* Newly generated key display */}
      {newKey && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/30 bg-green-500/5">
            <code className="flex-1 text-sm font-mono text-foreground break-all select-all">
              {newKey}
            </code>
            <button
              type="button"
              onClick={() => copyKey(newKey)}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground shrink-0"
              title={copyStatus === "failed" ? t.common.copyFailed : t.common.copy}
              aria-label={copyStatus === "failed" ? t.common.copyFailed : t.common.copy}
            >
              {copyStatus === "copied" ? (
                <Check className="h-4 w-4 text-success-ink" />
              ) : copyStatus === "failed" ? (
                <X className="h-4 w-4 text-destructive" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            <CopyFeedback status={copyStatus} />
          </div>
          <p className="text-xs text-muted-foreground">{t.settings.apiKeys.keyWarning}</p>
        </div>
      )}

      {/* Existing keys list */}
      {keys.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">
            {t.settings.apiKeys.existingKeysHeading}
          </h4>
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{k.name}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {k.prefix}... &middot;{" "}
                  {format(t.settings.apiKeys.createdPrefix, {
                    date: formatDate(k.createdAt, locale),
                  })}
                </p>
                {Array.isArray(k.permissions) && k.permissions.length > 0 && (
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {t.settings.apiKeys.scopedPrefix} {k.permissions.join(", ")}
                  </p>
                )}
                {k.expiresAt && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    {format(t.settings.apiKeys.expiresPrefix, {
                      date: formatDate(k.expiresAt, locale),
                    })}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteKey(k.id)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title={t.a11y.deleteKey}
                aria-label={t.a11y.deleteKey}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {loadFailed ? (
        <LoadFailed
          message={t.settings.apiKeys.loadFailed}
          onRetry={() => {
            setLoading(true);
            loadKeys();
          }}
        />
      ) : (
        keys.length === 0 &&
        !newKey && <p className="text-sm text-muted-foreground">{t.settings.apiKeys.emptyState}</p>
      )}
    </div>
  );
}

/* ────────────────────── Teams ────────────────────── */

export function TeamsSection() {
  const { t } = useTranslation();
  const later = useTimeouts();
  const isMobile = useMobile();
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [quotaMb, setQuotaMb] = useState("");
  const [retention, setRetention] = useState("");
  const [savingQuota, setSavingQuota] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [loadFailed, setLoadFailed] = useState(false);

  const loadTeams = useCallback(async () => {
    try {
      const data = await apiGet<{ teams: TeamEntry[] }>("/v1/teams");
      setTeams(data.teams);
      setLoadFailed(false);
    } catch {
      setTeams([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [openMenuId]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTeamName.trim()) return;
      setCreating(true);
      setActionMsg(null);
      later.cancel("actionMsg");
      try {
        await apiPost("/v1/teams", { name: newTeamName.trim() });
        setNewTeamName("");
        setShowCreateForm(false);
        setActionMsg({ type: "success", text: t.settings.teams.createSuccess });
        later(() => setActionMsg(null), 3000, "actionMsg");
        await loadTeams();
      } catch (err) {
        later.cancel("actionMsg");
        setActionMsg({
          type: "error",
          text: apiErrorMessage(
            t,
            err,
            {
              CONFLICT: t.settings.teams.duplicateName,
              // Blank names never leave the form, so length is the only rule left.
              VALIDATION_ERROR: t.settings.teams.nameTooLong,
            },
            t.settings.teams.createFailed,
          ),
        });
      } finally {
        setCreating(false);
      }
    },
    [newTeamName, loadTeams, t, later],
  );

  const handleRename = useCallback(
    async (id: string) => {
      if (!editingTeamName.trim()) return;
      setActionMsg(null);
      later.cancel("actionMsg");
      try {
        await apiPut(`/v1/teams/${id}`, { name: editingTeamName.trim() });
        setEditingTeamId(null);
        setEditingTeamName("");
        setActionMsg({ type: "success", text: t.settings.teams.renameSuccess });
        later(() => setActionMsg(null), 3000, "actionMsg");
        await loadTeams();
      } catch (err) {
        later.cancel("actionMsg");
        setActionMsg({
          type: "error",
          text: apiErrorMessage(
            t,
            err,
            {
              CONFLICT: t.settings.teams.duplicateName,
              VALIDATION_ERROR: t.settings.teams.nameTooLong,
            },
            t.settings.teams.renameFailed,
          ),
        });
      }
    },
    [editingTeamName, loadTeams, t, later],
  );

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (!confirm(format(t.settings.teams.deleteConfirm, { name }))) return;
      setActionMsg(null);
      later.cancel("actionMsg");
      try {
        await apiDelete(`/v1/teams/${id}`);
        setActionMsg({ type: "success", text: format(t.settings.teams.deleteSuccess, { name }) });
        later(() => setActionMsg(null), 3000, "actionMsg");
        await loadTeams();
      } catch (err) {
        later.cancel("actionMsg");
        // Both refusals (the Default team, a team with members) are 400s with
        // VALIDATION_ERROR, and this one line covers both.
        setActionMsg({
          type: "error",
          text: apiErrorMessage(
            t,
            err,
            { VALIDATION_ERROR: t.settings.teams.cannotDeleteDefault },
            t.settings.teams.deleteFailed,
          ),
        });
      }
      setOpenMenuId(null);
    },
    [loadTeams, t, later],
  );

  const handleExpandTeam = useCallback(
    (tm: TeamEntry) => {
      if (expandedTeamId === tm.id) {
        setExpandedTeamId(null);
        return;
      }
      setExpandedTeamId(tm.id);
      setQuotaMb(tm.storageQuota ? String(Math.round(tm.storageQuota / (1024 * 1024))) : "");
      setRetention(tm.retentionHours ? String(tm.retentionHours) : "");
    },
    [expandedTeamId],
  );

  const handleSaveQuota = useCallback(
    async (id: string) => {
      setSavingQuota(true);
      setActionMsg(null);
      later.cancel("actionMsg");
      try {
        const body: Record<string, number | null> = {};
        const mbVal = quotaMb.trim() ? Number(quotaMb) : 0;
        body.storageQuota = mbVal > 0 ? mbVal * 1024 * 1024 : null;
        const retVal = retention.trim() ? Number(retention) : 0;
        body.retentionHours = retVal > 0 ? retVal : null;
        await apiPut(`/v1/teams/${id}`, body);
        setActionMsg({ type: "success", text: t.settings.teams.quotaSaved });
        later(() => setActionMsg(null), 3000, "actionMsg");
        setExpandedTeamId(null);
        await loadTeams();
      } catch (err) {
        later.cancel("actionMsg");
        setActionMsg({
          type: "error",
          text: apiErrorMessage(t, err, {}, t.settings.teams.quotaSaveFailed),
        });
      } finally {
        setSavingQuota(false);
      }
    },
    [quotaMb, retention, loadTeams, t, later],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.teams.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.teams.description}</p>
      </div>

      {actionMsg && (
        <div
          role={actionMsg.type === "error" ? "alert" : "status"}
          className={cn(
            "text-sm px-3 py-2 rounded-lg flex items-center justify-between gap-2",
            actionMsg.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-success-ink",
          )}
        >
          <span>{actionMsg.text}</span>
          {actionMsg.type === "error" && (
            <button
              type="button"
              onClick={() => {
                setActionMsg(null);
                later.cancel("actionMsg");
              }}
              aria-label={t.common.close}
              className="p-0.5 rounded hover:bg-destructive/20 text-destructive shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <UsersRound className="h-4 w-4" />
          {t.settings.teams.createButton}
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-lg border border-border bg-muted/20 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">{t.settings.teams.newTeamHeading}</h4>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder={t.settings.teams.teamNamePlaceholder}
              required
              maxLength={TEAM_NAME_MAX_LENGTH}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground flex-1"
            />
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {t.common.create}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      )}

      <div className="border border-border rounded-lg">
        {/* Table header (desktop only) */}
        {!isMobile && (
          <div className="grid grid-cols-[1fr_100px_60px] gap-2 px-4 py-2.5 bg-muted/40 rounded-t-lg border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>{t.settings.teams.tableHeaderTeamName}</span>
            <span>{t.settings.teams.totalMembers}</span>
            <span />
          </div>
        )}

        {loadFailed ? (
          <LoadFailed
            message={t.settings.teams.loadFailed}
            onRetry={() => {
              setLoading(true);
              loadTeams();
            }}
          />
        ) : teams.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground rounded-b-lg">
            {t.settings.teams.emptyState}
          </div>
        ) : (
          teams.map((tm) => (
            <Fragment key={tm.id}>
              <div
                className={cn(
                  "items-center px-4 py-3 border-b border-border last:border-0 last:rounded-b-lg hover:bg-muted/20 transition-colors",
                  isMobile ? "flex gap-3" : "grid grid-cols-[1fr_100px_60px] gap-2",
                )}
              >
                <div className="flex-1 min-w-0">
                  {editingTeamId === tm.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingTeamName}
                        onChange={(e) => setEditingTeamName(e.target.value)}
                        maxLength={TEAM_NAME_MAX_LENGTH}
                        className="px-2 py-1 rounded border border-border bg-background text-sm text-foreground w-40"
                        ref={(el) => el?.focus()}
                        onKeyDown={(e) => {
                          // Keep Enter/Escape scoped to the rename input. Without
                          // stopping propagation, Escape also reaches the dialog's
                          // global Escape handler and closes the whole dialog.
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            handleRename(tm.id);
                          }
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditingTeamId(null);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(tm.id)}
                        className="text-xs text-primary-ink hover:underline"
                      >
                        {t.common.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTeamId(null)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        {t.common.cancel}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <span className="text-sm font-medium text-foreground truncate block">
                        {tm.name}
                      </span>
                      {isMobile && (
                        <span className="text-xs text-muted-foreground">
                          {format(
                            plural(
                              tm.memberCount,
                              t.settings.people.memberCount,
                              t.settings.people.memberCountPlural,
                            ),
                            { count: tm.memberCount },
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {!isMobile && (
                  <span className="text-sm text-muted-foreground">{tm.memberCount}</span>
                )}
                <div className="flex items-center gap-1 justify-end relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === tm.id ? null : tm.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title={t.common.actions}
                    aria-label={t.common.actions}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {openMenuId === tm.id && (
                    <div
                      role="menu"
                      className="absolute right-0 top-8 z-50 w-36 rounded-lg border border-border bg-background shadow-lg py-1"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTeamId(tm.id);
                          setEditingTeamName(tm.name);
                          setOpenMenuId(null);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t.settings.teams.renameAction}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleExpandTeam(tm);
                          setOpenMenuId(null);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        {t.settings.heading}
                      </button>
                      <div className="border-t border-border my-1" />
                      <button
                        type="button"
                        onClick={() => handleDelete(tm.id, tm.name)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t.settings.teams.deleteAction}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {expandedTeamId === tm.id && (
                <div className="px-4 py-3 border-b border-border last:border-0 bg-muted/10 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label
                        htmlFor={`quota-${tm.id}`}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {t.settings.teams.teamStorageQuota}
                      </label>
                      <input
                        id={`quota-${tm.id}`}
                        type="number"
                        min="0"
                        value={quotaMb}
                        onChange={(e) => setQuotaMb(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t.settings.teams.teamStorageQuotaDesc}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor={`retention-${tm.id}`}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {t.settings.teams.teamRetentionHours}
                      </label>
                      <input
                        id={`retention-${tm.id}`}
                        type="number"
                        min="0"
                        value={retention}
                        onChange={(e) => setRetention(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t.settings.teams.teamRetentionHoursDesc}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={savingQuota}
                      onClick={() => handleSaveQuota(tm.id)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {savingQuota && (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      )}
                      {t.common.save}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedTeamId(null)}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                    >
                      {t.common.cancel}
                    </button>
                  </div>
                </div>
              )}
            </Fragment>
          ))
        )}
      </div>
    </div>
  );
}

/* ────────────────────── Roles ────────────────────── */

const PERMISSION_GROUPS = [
  { id: "tools", permissions: ["tools:use"] },
  { id: "files", permissions: ["files:own", "files:all"] },
  { id: "apiKeys", permissions: ["apikeys:own", "apikeys:all"] },
  { id: "pipelines", permissions: ["pipelines:own", "pipelines:all"] },
  { id: "settings", permissions: ["settings:read", "settings:write"] },
  { id: "users", permissions: ["users:manage"] },
  { id: "teams", permissions: ["teams:manage"] },
  {
    id: "system",
    permissions: ["features:manage", "system:health", "audit:read"],
  },
  {
    id: "enterpriseAdmin",
    permissions: ["security:manage", "compliance:manage", "webhooks:manage"],
  },
] as const;

export function RolesSection() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManageRoles = hasPermission("security:manage");
  const later = useTimeouts();
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPermissions, setNewPermissions] = useState<string[]>([]);
  const [editingRole, setEditingRole] = useState<RoleEntry | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const [loadFailed, setLoadFailed] = useState(false);

  const loadRoles = useCallback(async () => {
    try {
      const data = await apiGet<{ roles: RoleEntry[] }>("/v1/roles");
      setRoles(data.roles);
      setLoadFailed(false);
    } catch {
      setRoles([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName.trim()) return;
      setActionMsg(null);
      later.cancel("actionMsg");
      // The server's refusals for these name no rule, so check here (#1445).
      const invalid = !isValidRoleName(newName)
        ? t.settings.roles.nameInvalid
        : newPermissions.length === 0
          ? t.settings.roles.permissionsRequired
          : null;
      if (invalid) {
        later.cancel("actionMsg");
        setActionMsg({ type: "error", text: invalid });
        return;
      }
      try {
        await apiPost("/v1/roles", {
          name: normalizeRoleName(newName),
          description: newDescription.trim(),
          permissions: newPermissions,
        });
        setNewName("");
        setNewDescription("");
        setNewPermissions([]);
        setShowCreateForm(false);
        setActionMsg({ type: "success", text: t.settings.roles.createSuccess });
        later(() => setActionMsg(null), 3000, "actionMsg");
        await loadRoles();
      } catch (err) {
        later.cancel("actionMsg");
        setActionMsg({
          type: "error",
          text: apiErrorMessage(
            t,
            err,
            {
              CONFLICT: t.settings.roles.duplicateRoleError,
              ESCALATION_DENIED: t.errors.escalationDenied,
            },
            t.settings.roles.createFailed,
          ),
        });
      }
    },
    [newName, newDescription, newPermissions, loadRoles, t, later],
  );

  const handleUpdate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingRole) return;
      setActionMsg(null);
      later.cancel("actionMsg");
      const invalid = !isValidRoleName(editName)
        ? t.settings.roles.nameInvalid
        : editPermissions.length === 0
          ? t.settings.roles.permissionsRequired
          : null;
      if (invalid) {
        later.cancel("actionMsg");
        setActionMsg({ type: "error", text: invalid });
        return;
      }
      try {
        await apiPut(`/v1/roles/${editingRole.id}`, {
          name: normalizeRoleName(editName),
          description: editDescription.trim(),
          permissions: editPermissions,
        });
        setEditingRole(null);
        setActionMsg({ type: "success", text: t.settings.roles.updateSuccess });
        later(() => setActionMsg(null), 3000, "actionMsg");
        await loadRoles();
      } catch (err) {
        later.cancel("actionMsg");
        setActionMsg({
          type: "error",
          text: apiErrorMessage(
            t,
            err,
            {
              CONFLICT: t.settings.roles.duplicateRoleError,
              ESCALATION_DENIED: t.errors.escalationDenied,
            },
            t.settings.roles.updateFailed,
          ),
        });
      }
    },
    [editingRole, editName, editDescription, editPermissions, loadRoles, t, later],
  );

  const handleDelete = useCallback(
    async (role: RoleEntry) => {
      const question =
        role.userCount > 0
          ? format(t.settings.roles.deleteConfirm, { name: role.name, count: role.userCount })
          : format(t.settings.roles.deleteConfirmSimple, { name: role.name });
      if (!confirm(question)) return;
      setActionMsg(null);
      later.cancel("actionMsg");
      try {
        await apiDelete(`/v1/roles/${role.id}`);
        setActionMsg({
          type: "success",
          text: format(t.settings.roles.deleteSuccess, { name: role.name }),
        });
        later(() => setActionMsg(null), 3000, "actionMsg");
        await loadRoles();
      } catch (err) {
        later.cancel("actionMsg");
        setActionMsg({
          type: "error",
          text: apiErrorMessage(
            t,
            err,
            { ESCALATION_DENIED: t.errors.escalationDenied },
            t.settings.roles.deleteFailed,
          ),
        });
      }
    },
    [loadRoles, t, later],
  );

  const togglePermission = (perm: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.roles.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.roles.description}</p>
      </div>

      {actionMsg && (
        <div
          role={actionMsg.type === "error" ? "alert" : "status"}
          className={cn(
            "text-sm px-3 py-2 rounded-lg flex items-center justify-between gap-2",
            actionMsg.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-success-ink",
          )}
        >
          <span>{actionMsg.text}</span>
          {actionMsg.type === "error" && (
            <button
              type="button"
              onClick={() => {
                setActionMsg(null);
                later.cancel("actionMsg");
              }}
              aria-label={t.common.close}
              className="p-0.5 rounded hover:bg-destructive/20 text-destructive shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {canManageRoles && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t.settings.roles.createButton}
          </button>
        </div>
      )}

      {/* Create role form */}
      {canManageRoles && showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-lg border border-border bg-muted/20 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">{t.settings.roles.newRoleHeading}</h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.settings.roles.roleNamePlaceholder}
              required
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            />
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder={t.settings.roles.descriptionPlaceholder}
              maxLength={500}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t.settings.roles.permissionsLabel}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.id} className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    {t.settings.roles.permGroup[group.id]}
                  </p>
                  {group.permissions.map((perm) => (
                    <label key={perm} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newPermissions.includes(perm)}
                        onChange={() => togglePermission(perm, newPermissions, setNewPermissions)}
                        className="rounded border-border"
                      />
                      <span className="font-mono">{perm}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t.common.create}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setNewName("");
                setNewDescription("");
                setNewPermissions([]);
              }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      )}

      {/* Edit role form */}
      {canManageRoles && editingRole && (
        <form
          onSubmit={handleUpdate}
          className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">
            {format(t.settings.roles.editHeading, { name: editingRole.name })}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t.settings.roles.roleNamePlaceholder}
              required
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            />
            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder={t.settings.roles.descriptionPlaceholder}
              maxLength={500}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t.settings.roles.permissionsLabel}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.id} className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    {t.settings.roles.permGroup[group.id]}
                  </p>
                  {group.permissions.map((perm) => (
                    <label key={perm} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editPermissions.includes(perm)}
                        onChange={() => togglePermission(perm, editPermissions, setEditPermissions)}
                        className="rounded border-border"
                      />
                      <span className="font-mono">{perm}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t.common.save}
            </button>
            <button
              type="button"
              onClick={() => setEditingRole(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      )}

      {/* Role cards */}
      <div className="space-y-3">
        {loadFailed ? (
          <LoadFailed
            message={t.settings.roles.loadFailed}
            onRetry={() => {
              setLoading(true);
              loadRoles();
            }}
          />
        ) : roles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t.settings.roles.emptyState}
          </p>
        ) : (
          roles.map((role) => (
            <div
              key={role.id}
              className="p-4 rounded-lg border border-border bg-muted/20 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground capitalize">
                    {role.name}
                  </span>
                  {role.isBuiltin && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      {t.settings.roles.builtInBadge}
                    </span>
                  )}
                  <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-xs font-medium text-primary-ink">
                    {plural(
                      role.userCount,
                      format(t.settings.people.userCount, { count: role.userCount }),
                      format(t.settings.people.userCountPlural, { count: role.userCount }),
                    )}
                  </span>
                </div>
                {!role.isBuiltin && canManageRoles && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRole(role);
                        setEditName(role.name);
                        setEditDescription(role.description);
                        setEditPermissions(
                          Array.isArray(role.permissions) ? [...role.permissions] : [],
                        );
                      }}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={t.a11y.editRole}
                      aria-label={t.a11y.editRole}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(role)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title={t.a11y.deleteRole}
                      aria-label={t.a11y.deleteRole}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              {role.description && (
                <p className="text-xs text-muted-foreground">{role.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(Array.isArray(role.permissions) ? role.permissions : []).map((perm) => (
                  <span
                    key={perm}
                    className="inline-block px-2 py-0.5 rounded-full bg-muted text-xs font-mono text-muted-foreground"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ────────────────────── Audit Log ────────────────────── */

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorUsername: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string;
}

function formatRelativeTime(
  iso: string,
  locale: string,
  auditLogT: TranslationKeys["settings"]["auditLog"],
): string {
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return "---";
  const diff = Date.now() - parsed;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return auditLogT.justNow;
  if (mins < 60) return format(auditLogT.minutesAgo, { mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return format(auditLogT.hoursAgo, { hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return format(auditLogT.daysAgo, { days });
  return formatDate(iso, locale);
}

export function AuditLogSection() {
  const { t, locale } = useTranslation();
  const isMobile = useMobile();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const limit = 25;
  const fetchIdRef = useRef(0);

  const fetchEntries = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (actionFilter) params.set("action", actionFilter);
      const data = await apiGet<{ entries: AuditEntry[]; total: number }>(
        `/v1/audit-log?${params}`,
      );
      if (fetchId !== fetchIdRef.current) return;
      setEntries(data.entries);
      setTotal(data.total);
      setLoadFailed(false);
    } catch {
      if (fetchId !== fetchIdRef.current) return;
      setEntries([]);
      setTotal(0);
      setLoadFailed(true);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [page, actionFilter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleFilterChange = (value: string) => {
    setActionFilter(value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{t.settings.auditLog.heading}</h3>
        <select
          value={actionFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
        >
          <option value="">{t.settings.auditLog.allActionsFilter}</option>
          {CORE_AUDIT_EVENTS.map((a) => (
            <option key={a} value={a}>
              {a.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadFailed ? (
        <LoadFailed message={t.settings.auditLog.loadFailed} onRetry={fetchEntries} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t.settings.auditLog.emptyState}
        </p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {isMobile ? (
            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <Fragment key={entry.id}>
                  <button
                    type="button"
                    aria-expanded={expandedId === entry.id}
                    aria-controls={`audit-details-${entry.id}`}
                    className="w-full px-3 py-2.5 hover:bg-muted/20 cursor-pointer transition-colors text-start"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        {entry.action}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(entry.createdAt, locale, t.settings.auditLog)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-foreground">{entry.actorUsername}</span>
                      {entry.ipAddress && (
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {entry.ipAddress}
                        </span>
                      )}
                      {entry.targetType && (
                        <span className="text-xs text-muted-foreground">
                          {entry.targetType}
                          {entry.targetId ? ` #${entry.targetId}` : ""}
                        </span>
                      )}
                    </div>
                  </button>
                  {expandedId === entry.id && entry.details && (
                    <div id={`audit-details-${entry.id}`} className="px-3 py-2 bg-muted/10">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono overflow-x-auto">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-start px-3 py-2 font-medium text-muted-foreground">
                    {t.settings.auditLog.tableHeaderTime}
                  </th>
                  <th className="text-start px-3 py-2 font-medium text-muted-foreground">
                    {t.settings.auditLog.tableHeaderUser}
                  </th>
                  <th className="text-start px-3 py-2 font-medium text-muted-foreground">IP</th>
                  <th className="text-start px-3 py-2 font-medium text-muted-foreground">
                    {t.settings.auditLog.tableHeaderAction}
                  </th>
                  <th className="text-start px-3 py-2 font-medium text-muted-foreground">
                    {t.settings.auditLog.tableHeaderTarget}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr
                      className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(entry.createdAt, locale, t.settings.auditLog)}
                      </td>
                      <td className="px-3 py-2 text-foreground">{entry.actorUsername}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {entry.ipAddress ?? "---"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {entry.targetType
                          ? `${entry.targetType}${entry.targetId ? ` #${entry.targetId}` : ""}`
                          : "---"}
                      </td>
                    </tr>
                    {expandedId === entry.id && entry.details && (
                      <tr className="border-b border-border last:border-0">
                        <td colSpan={5} className="px-3 py-2 bg-muted/10">
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono overflow-x-auto">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {format(t.settings.auditLog.paginationInfo, { page, totalPages, total })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t.settings.auditLog.previousButton}
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t.settings.auditLog.nextButton}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────── Tools ────────────────────── */

export function ToolsSection() {
  const { t } = useTranslation();
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showRestartBanner, setShowRestartBanner] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setDisabledTools(parseStringArray(data.settings.disabledTools));
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredTools = useMemo(() => {
    if (!search) return TOOLS;
    const q = search.toLowerCase();
    return TOOLS.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [search]);

  const groupedTools = useMemo(() => {
    const groups = new Map<string, typeof TOOLS>();
    for (const tool of filteredTools) {
      const list = groups.get(tool.category) || [];
      list.push(tool);
      groups.set(tool.category, list);
    }
    return groups;
  }, [filteredTools]);

  const toggleTool = useCallback((toolId: string) => {
    setDisabledTools((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId],
    );
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setShowRestartBanner(false);
    try {
      await apiPut("/v1/settings", { disabledTools: JSON.stringify(disabledTools) });
      setShowRestartBanner(true);
    } catch (err) {
      setSaveError(apiErrorMessage(t, err, {}, t.common.somethingWentWrong));
    } finally {
      setSaving(false);
    }
  }, [disabledTools, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.tools.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.tools.description}</p>
      </div>

      {showRestartBanner && (
        <div className="px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-700 dark:text-amber-400">
          {t.settings.tools.restartBanner}
        </div>
      )}

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.settings.tools.searchPlaceholder}
          className="w-full ps-9 pe-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div className="space-y-4 max-h-[50dvh] overflow-y-auto">
        {CATEGORIES.filter((cat) => groupedTools.has(cat.id)).map((category) => (
          <div key={category.id}>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
              {getCategoryName(t, category.id, category.name)}
            </h4>
            <div className="space-y-1">
              {groupedTools.get(category.id)?.map((tool) => {
                const isDisabled = disabledTools.includes(tool.id);
                return (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {getToolName(t, tool.id, tool.name)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {getToolDescription(t, tool.id, tool.description)}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!isDisabled}
                      aria-label={getToolName(t, tool.id, tool.name)}
                      onClick={() => toggleTool(tool.id)}
                      className={cn(
                        "w-11 h-6 rounded-full transition-colors relative shrink-0 ms-3",
                        !isDisabled ? "bg-primary" : "bg-muted-foreground/30",
                      )}
                    >
                      <span
                        className={cn(
                          "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
                          !isDisabled ? "translate-x-6" : "translate-x-1",
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {filteredTools.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t.settings.tools.noSearchResults}
        </p>
      )}

      {loadFailed && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-700 dark:text-red-400">
          {t.settings.tools.loadFailedError}
        </div>
      )}

      {saveError && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-700 dark:text-red-400">
          {saveError}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loadFailed}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t.settings.tools.saveButton}
        </button>
        <span className="text-xs text-muted-foreground">
          {plural(
            disabledTools.length,
            format(t.settings.tools.disabledCountOne, { count: disabledTools.length }),
            format(t.settings.tools.disabledCountOther, { count: disabledTools.length }),
          )}
        </span>
      </div>
    </div>
  );
}

/* ────────────────────── About ────────────────────── */

function AboutSection() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.about.heading}</h3>
      </div>

      <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-3">
        <div className="flex items-center gap-3">
          <OtterLogo className="h-8 w-8 text-primary" />
          <div className="text-2xl font-bold text-foreground">
            <span className="text-primary-ink">SnapOtter</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t.settings.about.appDescription}</p>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{t.settings.about.versionLabel}</span>
          <span data-testid="app-version" className="font-mono text-foreground">
            {APP_VERSION}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">{t.settings.about.licenseLabel}</span>
        <div>
          <span className="font-mono text-foreground">AGPLv3</span>
          <p className="text-xs text-muted-foreground">{t.settings.about.licenseDescription}</p>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">{t.settings.about.linksHeading}</h4>
        <div className="flex flex-col gap-1.5">
          <a
            href="https://github.com/snapotter-hq/snapotter"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-ink hover:underline"
          >
            {t.settings.about.githubLink}
          </a>
          <a
            href="https://docs.snapotter.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-ink hover:underline"
          >
            {t.settings.about.docsLink}
          </a>
          <a
            href={appUrl("/api/docs")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-ink hover:underline"
          >
            {t.settings.about.apiRefLink}
          </a>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────── Shared ────────────────────── */

/**
 * Stands in for a list or form whose data failed to load, so an empty list
 * only ever means "there are none" (#1447): "No API keys" after a 500 reads
 * as a fact, and an admin may go and create them again.
 */
function LoadFailed({
  message,
  onRetry,
  inline = false,
}: {
  message: string;
  onRetry: () => void;
  inline?: boolean;
}) {
  const { t } = useTranslation();
  if (inline) {
    return (
      <div role="alert" className="flex items-center gap-2">
        <p className="text-xs text-destructive">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-2.5 py-1 rounded-lg border border-border text-xs text-foreground hover:bg-muted transition-colors shrink-0"
        >
          {t.common.retry}
        </button>
      </div>
    );
  }
  return (
    <div role="alert" className="px-4 py-8 text-center space-y-3">
      <p className="text-sm text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors"
      >
        {t.common.retry}
      </button>
    </div>
  );
}

/**
 * Number input for a string-valued setting. The field may be empty while the user
 * types; if it is left empty, it restores the value it had on focus, so an empty
 * string (which the API reads as 0) is never saved by accident. See #1186.
 */
function SettingNumberInput({
  value,
  fallback,
  onChange,
  ...props
}: {
  value: string | undefined;
  fallback: string;
  onChange: (value: string) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "onFocus" | "onBlur"
>) {
  const valueOnFocus = useRef(value ?? fallback);
  return (
    <input
      {...props}
      type="number"
      value={value ?? fallback}
      onFocus={() => {
        valueOnFocus.current = value ?? fallback;
      }}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        if (e.target.value.trim() === "") onChange(valueOnFocus.current);
      }}
    />
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  const isMobile = useMobile();
  return (
    <div
      className={cn(
        "py-3 border-b border-border last:border-0",
        isMobile ? "flex flex-col gap-2" : "flex items-center justify-between",
      )}
    >
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className={cn(!isMobile && "shrink-0 ms-4")}>{children}</div>
    </div>
  );
}
