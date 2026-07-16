import { APP_VERSION, CATEGORIES, SUPPORTED_LOCALES, TOOLS } from "@snapotter/shared";
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
import { apiDelete, apiGet, apiPost, apiPut, clearToken, formatHeaders } from "@/lib/api";
import { shouldShowInstallFeedbackCard } from "@/lib/feedback";
import { format, plural } from "@/lib/format";
import { changedSettings, writableSettings } from "@/lib/settings-payload";
import { getCategoryName, getToolDescription, getToolName } from "@/lib/tool-i18n";
import { cn, copyToClipboard } from "@/lib/utils";
import { useAnalyticsStore } from "@/stores/analytics-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useThemeStore } from "@/stores/theme-store";
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
  requiredPermission?: string;
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
        requiredPermission: "settings:write",
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
        requiredPermission: "users:manage",
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
      { id: "api-keys", label: t.settings.nav.apiKeys, icon: Key },
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
        requiredPermission: "settings:write",
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

  const visibleNavItems = NAV_ITEMS.filter(
    (item) =>
      (!item.requiredPermission || hasPermission(item.requiredPermission)) &&
      (!item.authRequired || authEnabled),
  );

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
                section === item.id
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
          {section === "general" && <GeneralSection />}
          {section === "system" && <SystemSection />}
          {section === "security" && <SecuritySection />}
          {section === "people" && <PeopleSection />}
          {section === "teams" && <TeamsSection />}
          {section === "roles" && <RolesSection />}
          {section === "audit-log" && <AuditLogSection />}
          {section === "usage" && <UsageSection />}
          {section === "api-keys" && <ApiKeysSection />}
          {section === "ai-features" && <AiFeaturesSection />}
          {section === "tools" && <ToolsSection />}

          {section === "about" && <AboutSection />}
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
                section === item.id
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

          {section === "general" && <GeneralSection />}
          {section === "system" && <SystemSection />}
          {section === "security" && <SecuritySection />}
          {section === "people" && <PeopleSection />}
          {section === "teams" && <TeamsSection />}
          {section === "roles" && <RolesSection />}
          {section === "audit-log" && <AuditLogSection />}
          {section === "usage" && <UsageSection />}
          {section === "api-keys" && <ApiKeysSection />}
          {section === "ai-features" && <AiFeaturesSection />}
          {section === "tools" && <ToolsSection />}

          {section === "about" && <AboutSection />}
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

function GeneralSection() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const { authEnabled } = useAuth();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultToolView, setDefaultToolView] = useState("sidebar");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<{ user: SessionUser }>("/auth/session")
        .then((data) => setUser(data.user))
        .catch(() => {
          setUser({
            id: 0,
            username: localStorage.getItem("snapotter-username") || "",
            role: "unknown",
          });
        }),
      apiGet<{ preferences: Record<string, unknown> }>("/v1/preferences")
        .then((data) => {
          if (typeof data.preferences.defaultToolView === "string") {
            setDefaultToolView(data.preferences.defaultToolView);
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: formatHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      clearToken();
      localStorage.removeItem("snapotter-username");
      if (data.logoutUrl) {
        window.location.href = data.logoutUrl;
      } else {
        window.location.href = "/login";
      }
    } catch {
      clearToken();
      localStorage.removeItem("snapotter-username");
      window.location.href = "/login";
    }
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      // The default home view is a per-user preference, not instance config, so
      // it saves to /v1/preferences (writable by any authenticated user) rather
      // than the admin-only /v1/settings.
      await apiPut("/v1/preferences", { defaultToolView });
      setSaveMsg(t.settings.general.saveSuccess);
      useSettingsStore.setState({
        defaultToolView: defaultToolView as "sidebar" | "fullscreen",
      });
    } catch {
      setSaveMsg(t.settings.general.saveFailed);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [defaultToolView, t.settings.general.saveSuccess, t.settings.general.saveFailed]);

  const username = user?.username || "admin";
  const role = user?.role || "unknown";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.general.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.general.description}</p>
      </div>

      {/* User info */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
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
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t.settings.general.logOut}
          </button>
        )}
      </div>

      {/* Default view */}
      <SettingRow
        label={t.settings.general.defaultToolViewLabel}
        description={t.settings.general.defaultToolViewDescription}
      >
        <select
          value={defaultToolView}
          onChange={(e) => setDefaultToolView(e.target.value)}
          aria-label={t.settings.general.defaultToolViewLabel}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
        >
          <option value="sidebar">{t.settings.general.sidebarOption}</option>
          <option value="fullscreen">{t.settings.general.fullscreenGridOption}</option>
        </select>
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
        <span className="text-sm font-mono text-muted-foreground">{APP_VERSION}</span>
      </SettingRow>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t.settings.general.saveButton}
        </button>
        {saveMsg && (
          <span
            className={cn(
              "text-sm",
              saveMsg === t.settings.general.saveFailed
                ? "text-destructive"
                : "text-green-600 dark:text-green-400",
            )}
          >
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────── System ────────────────────── */

function SystemSection() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const analyticsConfig = useAnalyticsStore((s) => s.config);
  const analyticsConfigLoaded = useAnalyticsStore((s) => s.configLoaded);
  const [settings, setSettings] = useState<Record<string, string>>({});
  // Snapshot of the last server state, so a save sends only the fields this tab
  // changed (never a stale value that could clobber another admin's concurrent edit).
  const originalSettingsRef = useRef<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [installFeedbackOpen, setInstallFeedbackOpen] = useState(false);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setSettings(data.settings);
        originalSettingsRef.current = data.settings;
      })
      .catch(() => {
        // Fallback defaults if endpoint not ready
        const fallback = {
          fileUploadLimitMb: "100",
          defaultTheme: "system",
          defaultLocale: "en",
          loginAttemptLimit: "5",
        };
        setSettings(fallback);
        originalSettingsRef.current = fallback;
      })
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateInstallFeedbackState = useCallback(async (key: string, value: string) => {
    await apiPut("/v1/settings", { [key]: value });
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleInstallFeedbackSubmitted = useCallback(() => {
    void updateInstallFeedbackState("feedback.install.submittedAt", new Date().toISOString());
  }, [updateInstallFeedbackState]);

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
    try {
      const changed = changedSettings(originalSettingsRef.current, settings);
      await apiPut("/v1/settings", writableSettings(changed));
      if ("analyticsEnabled" in changed) {
        const { optIn, optOut } = await import("@/lib/analytics");
        if (settings.analyticsEnabled === "false") optOut();
        else optIn();
        // Refresh the cached config so this tab converges immediately: optOut()
        // stops the SDKs but leaves the store enabled, which would keep feedback
        // surfaces visible (and silently drop their submissions) until a refocus.
        useAnalyticsStore.getState().fetchConfig();
      }
      if (settings.defaultTheme) {
        const theme = settings.defaultTheme as "light" | "dark" | "system";
        useThemeStore.getState().setTheme(theme);
      }
      originalSettingsRef.current = { ...settings };
      setSaveMsg(t.settings.system.saveSuccess);
    } catch {
      setSaveMsg(t.settings.system.saveFailed);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [settings, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const installFeedbackVisible = shouldShowInstallFeedbackCard({
    settings,
    role,
    analyticsConfigLoaded,
    analyticsEnabled: Boolean(analyticsConfig?.enabled),
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
        <input
          type="number"
          value={settings.fileUploadLimitMb || "100"}
          onChange={(e) => updateSetting("fileUploadLimitMb", e.target.value)}
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
          value={settings.defaultTheme || "system"}
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
          value={settings.defaultLocale || "en"}
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

      <SettingRow
        label={t.settings.system.loginAttemptLimitLabel}
        description={t.settings.system.loginAttemptLimitDescription}
      >
        <input
          type="number"
          value={settings.loginAttemptLimit || "5"}
          onChange={(e) => updateSetting("loginAttemptLimit", e.target.value)}
          aria-label={t.settings.system.loginAttemptLimitLabel}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={1}
          max={100}
        />
      </SettingRow>

      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground mb-3">
          {t.settings.fileManagement.title}
        </h4>
      </div>
      <SettingRow
        label={t.settings.fileManagement.maxAge}
        description={t.settings.fileManagement.maxAgeDescription}
      >
        <input
          type="number"
          value={settings.tempFileMaxAgeHours || "24"}
          onChange={(e) => updateSetting("tempFileMaxAgeHours", e.target.value)}
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
        <input
          type="number"
          value={settings.jobsRetentionDays || "30"}
          onChange={(e) => updateSetting("jobsRetentionDays", e.target.value)}
          aria-label={t.settings.dataRetention.jobsRetentionDays}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={0}
        />
      </SettingRow>
      <SettingRow
        label={t.settings.dataRetention.auditRetentionDays}
        description={t.settings.dataRetention.auditRetentionDaysDesc}
      >
        <input
          type="number"
          value={settings.auditRetentionDays || "0"}
          onChange={(e) => updateSetting("auditRetentionDays", e.target.value)}
          aria-label={t.settings.dataRetention.auditRetentionDays}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={0}
        />
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
            className={cn(
              "text-sm",
              saveMsg === t.settings.system.saveFailed
                ? "text-destructive"
                : "text-green-600 dark:text-green-400",
            )}
          >
            {saveMsg}
          </span>
        )}
      </div>

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
                const res = await fetch("/api/v1/admin/support-bundle", {
                  headers: formatHeaders(),
                });
                if (!res.ok) throw new Error(`${res.status}`);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const cd = res.headers.get("Content-Disposition") || "";
                const filenameMatch = cd.match(/filename=([^\s;]+)/);
                a.download = filenameMatch ? filenameMatch[1] : "snapotter-support.zip";
                a.click();
                URL.revokeObjectURL(url);
              } catch {
                setBundleError(t.settings.system.supportBundleFailed);
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

function SecuritySection() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChangePassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
        setMessage({ type: "error", text: t.settings.security.passwordsMismatch });
        return;
      }
      if (newPassword.length < 8) {
        setMessage({ type: "error", text: t.settings.security.passwordTooShort });
        return;
      }

      setSubmitting(true);
      setMessage(null);
      try {
        await apiPost("/auth/change-password", { currentPassword, newPassword });
        setMessage({ type: "success", text: t.settings.security.changeSuccess });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch (err) {
        const msg = err instanceof Error ? err.message : t.settings.security.changeFailed;
        setMessage({
          type: "error",
          text: msg.includes("401") ? t.settings.security.currentPasswordIncorrect : msg,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [
      currentPassword,
      newPassword,
      confirmPassword,
      t.settings.security.changeFailed,
      t.settings.security.currentPasswordIncorrect,
      t.settings.security.changeSuccess,
      t.settings.security.passwordsMismatch,
      t.settings.security.passwordTooShort,
    ],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.security.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.security.description}</p>
      </div>

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
            <p
              id="password-change-error"
              role="alert"
              className={cn(
                "text-sm",
                message.type === "error"
                  ? "text-destructive"
                  : "text-green-600 dark:text-green-400",
              )}
            >
              {message.text}
            </p>
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

      <div className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{t.settings.security.loginAttemptLimitNote}</p>
      </div>

      <TwoFactorSettings />

      {hasPermission("settings:write") && <AdminSecuritySettings />}
    </div>
  );
}

export function AdminSecuritySettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Record<string, string>>({});
  // Snapshot of the last server state; a save sends only the fields this tab changed
  // so an unrelated edit here can never echo (and revert) another admin's change,
  // such as an instance-wide analytics opt-out.
  const originalSettingsRef = useRef<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setSettings(data.settings);
        originalSettingsRef.current = data.settings;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await apiPut(
        "/v1/settings",
        writableSettings(changedSettings(originalSettingsRef.current, settings)),
      );
      originalSettingsRef.current = { ...settings };
      setSaveMsg({ type: "success", text: t.settings.security.securitySettingsSaved });
    } catch (err) {
      setSaveMsg({
        type: "error",
        text: err instanceof Error ? err.message : t.settings.security.securitySettingsFailed,
      });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [settings, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
        <input
          type="number"
          value={settings.sessionIdleTimeoutMinutes || "0"}
          onChange={(e) => updateSetting("sessionIdleTimeoutMinutes", e.target.value)}
          aria-label={t.settings.security.sessionIdleTimeout}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={0}
        />
      </SettingRow>

      <SettingRow
        label={t.settings.security.maxSessionsPerUser}
        description={t.settings.security.maxSessionsPerUserDesc}
      >
        <input
          type="number"
          value={settings.maxSessionsPerUser || "0"}
          onChange={(e) => updateSetting("maxSessionsPerUser", e.target.value)}
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
          value={settings.mfaPolicy || "optional"}
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
        <input
          type="number"
          value={settings.passwordMinLength || "8"}
          onChange={(e) => updateSetting("passwordMinLength", e.target.value)}
          aria-label={t.settings.security.passwordMinLength}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={4}
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
          aria-checked={settings.passwordRequireUppercase !== "false"}
          aria-label={t.settings.security.passwordRequireUppercase}
          onClick={() =>
            updateSetting(
              "passwordRequireUppercase",
              settings.passwordRequireUppercase === "false" ? "true" : "false",
            )
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            settings.passwordRequireUppercase !== "false" ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              settings.passwordRequireUppercase !== "false" ? "translate-x-6" : "translate-x-1",
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
          aria-checked={settings.passwordRequireNumber !== "false"}
          aria-label={t.settings.security.passwordRequireNumber}
          onClick={() =>
            updateSetting(
              "passwordRequireNumber",
              settings.passwordRequireNumber === "false" ? "true" : "false",
            )
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            settings.passwordRequireNumber !== "false" ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              settings.passwordRequireNumber !== "false" ? "translate-x-6" : "translate-x-1",
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
          aria-checked={settings.passwordRequireSpecial === "true"}
          aria-label={t.settings.security.passwordRequireSpecial}
          onClick={() =>
            updateSetting(
              "passwordRequireSpecial",
              settings.passwordRequireSpecial === "true" ? "false" : "true",
            )
          }
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            settings.passwordRequireSpecial === "true" ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "block w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              settings.passwordRequireSpecial === "true" ? "translate-x-6" : "translate-x-1",
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
            className={cn(
              "text-sm",
              saveMsg.type === "error" ? "text-destructive" : "text-green-600 dark:text-green-400",
            )}
          >
            {saveMsg.text}
          </span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────── People ────────────────────── */

function secureRandom(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function generatePassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  // The server policy can require a special character (passwordRequireSpecial), so
  // always include one alongside an upper, lower, and digit; otherwise Generate can
  // produce a password the server rejects. These specials all satisfy its check.
  const special = "!@#$%^&*()-_=+";
  const all = upper + lower + digits + special;
  const required = [
    upper[secureRandom(upper.length)],
    lower[secureRandom(lower.length)],
    digits[secureRandom(digits.length)],
    special[secureRandom(special.length)],
  ];
  const rest = Array.from({ length: 12 }, () => all[secureRandom(all.length)]);
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandom(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function PeopleSection() {
  const { t } = useTranslation();
  const isMobile = useMobile();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [maxUsers, setMaxUsers] = useState(5);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [newTeam, setNewTeam] = useState("Default");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showGeneratedPw, setShowGeneratedPw] = useState(false);
  const [pwCopied, setPwCopied] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserEntry | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [resetPasswordUser, setResetPasswordUser] = useState<UserEntry | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [availableRoles, setAvailableRoles] = useState<RoleEntry[]>([]);

  const loadTeams = useCallback(async () => {
    try {
      const data = await apiGet<{ teams: TeamEntry[] }>("/v1/teams");
      setTeams(data.teams);
    } catch {
      setTeams([]);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiGet<{ users: UserEntry[]; maxUsers: number }>("/auth/users");
      setUsers(data.users);
      setMaxUsers(data.maxUsers);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadTeams();
    apiGet<{ roles: RoleEntry[] }>("/v1/roles")
      .then((data) => setAvailableRoles(data.roles))
      .catch(() => setAvailableRoles([]));
  }, [loadUsers, loadTeams]);

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
      setAddError(null);
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
        setPwCopied(false);
        setActionMsg({ type: "success", text: t.settings.people.createSuccess });
        await loadUsers();
      } catch (err) {
        const msg = err instanceof Error ? err.message : t.settings.people.createFailed;
        setAddError(
          msg.includes("403") ? format(t.settings.people.userLimitReached, { max: maxUsers }) : msg,
        );
      } finally {
        setAdding(false);
        setTimeout(() => setActionMsg(null), 3000);
      }
    },
    [
      newUsername,
      newPassword,
      newRole,
      newTeam,
      maxUsers,
      loadUsers,
      t.settings.people.createFailed,
      t.settings.people.createSuccess,
      t.settings.people.userLimitReached,
    ],
  );

  const handleDeleteUser = useCallback(
    async (id: string, username: string) => {
      if (!confirm(format(t.settings.people.deleteConfirm, { username }))) return;
      try {
        await apiDelete(`/auth/users/${id}`);
        setActionMsg({
          type: "success",
          text: format(t.settings.people.deleteSuccess, { username }),
        });
        await loadUsers();
      } catch {
        setActionMsg({ type: "error", text: t.settings.people.deleteFailed });
      }
      setOpenMenuId(null);
      setTimeout(() => setActionMsg(null), 3000);
    },
    [
      loadUsers,
      t.settings.people.deleteSuccess,
      t.settings.people.deleteFailed,
      t.settings.people.deleteConfirm,
    ],
  );

  const handleUpdateUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUser) return;
      try {
        await apiPut(`/auth/users/${editingUser.id}`, {
          role: editRole,
          team: editTeam,
        });
        setEditingUser(null);
        setActionMsg({ type: "success", text: t.settings.people.updateSuccess });
        await loadUsers();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update user";
        setActionMsg({
          type: "error",
          text: msg.includes("400") ? t.settings.people.cannotRemoveOwnAdmin : msg,
        });
      }
      setTimeout(() => setActionMsg(null), 3000);
    },
    [
      editingUser,
      editRole,
      editTeam,
      loadUsers,
      t.settings.people.cannotRemoveOwnAdmin,
      t.settings.people.updateSuccess,
    ],
  );

  const handleResetPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resetPasswordUser) return;
      try {
        await apiPost(`/auth/users/${resetPasswordUser.id}/reset-password`, {
          newPassword: resetPassword,
        });
        setResetPasswordUser(null);
        setResetPassword("");
        setActionMsg({ type: "success", text: t.settings.people.resetSuccess });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to reset password";
        setActionMsg({ type: "error", text: msg });
      }
      setTimeout(() => setActionMsg(null), 3000);
    },
    [resetPasswordUser, resetPassword, t.settings.people.resetSuccess],
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
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t.settings.people.heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t.settings.people.description}</p>
      </div>

      {/* User count */}
      <p className="text-sm text-muted-foreground">
        {maxUsers > 0
          ? `${users.length} / ${maxUsers} ${plural(maxUsers, format(t.settings.people.userCount, { count: "" }), format(t.settings.people.userCountPlural, { count: "" })).trim()}`
          : plural(
              users.length,
              format(t.settings.people.userCount, { count: users.length }),
              format(t.settings.people.userCountPlural, { count: users.length }),
            )}
      </p>

      {/* Action message */}
      {actionMsg && (
        <div
          className={cn(
            "text-sm px-3 py-2 rounded-lg",
            actionMsg.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-600 dark:text-green-400",
          )}
        >
          {actionMsg.text}
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
            setAddError(null);
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
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={t.settings.people.usernamePlaceholder}
                required
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
                  setPwCopied(false);
                }}
                placeholder={t.auth.password}
                required
                minLength={8}
                className={cn(
                  "flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground",
                  showGeneratedPw && "font-mono",
                )}
              />
              {showGeneratedPw && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyToClipboard(newPassword);
                    if (ok) {
                      setPwCopied(true);
                      setTimeout(() => setPwCopied(false), 2000);
                    }
                  }}
                  className={cn(
                    "shrink-0 p-2 rounded-lg border border-border transition-colors",
                    pwCopied
                      ? "text-green-500 bg-green-500/10"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title={
                    pwCopied
                      ? t.settings.people.passwordCopied
                      : t.settings.people.copyPasswordButton
                  }
                >
                  {pwCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
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
              {teams.length === 0 && <option value="Default">Default</option>}
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
                const pw = generatePassword();
                setNewPassword(pw);
                setShowGeneratedPw(true);
                setPwCopied(false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary/10 text-xs text-primary hover:bg-primary/20 font-medium transition-colors"
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
                setPwCopied(false);
                // Reset the field values too, so re-opening the form is clean.
                setNewUsername("");
                setNewPassword("");
                setAddError(null);
              }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
          {showGeneratedPw && !pwCopied && (
            <p className="text-xs text-amber-500 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 shrink-0" />
              {t.settings.people.copyPasswordWarning}
            </p>
          )}
          {addError && (
            <p role="alert" className="text-sm text-destructive">
              {addError}
            </p>
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
              {teams.map((tm) => (
                <option key={tm.id} value={tm.name}>
                  {tm.name}
                </option>
              ))}
              {teams.length === 0 && <option value="Default">Default</option>}
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
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder={t.settings.people.newPasswordLabel}
              required
              minLength={8}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground w-60"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
            >
              {t.settings.people.resetPasswordButton}
            </button>
            <button
              type="button"
              onClick={() => {
                setResetPasswordUser(null);
                setResetPassword("");
              }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
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
        {filteredUsers.length === 0 ? (
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
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
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
                            ? "bg-primary/15 text-primary"
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
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
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
                          ? "bg-primary/15 text-primary"
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
                  title="Actions"
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
                          setResetPasswordUser(u);
                          setResetPassword("");
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

function ApiKeysSection() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [showScoping, setShowScoping] = useState(false);
  const [scopedPerms, setScopedPerms] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { permissions } = useAuth();

  const loadKeys = useCallback(async () => {
    try {
      const data = await apiGet<{ apiKeys: ApiKeyEntry[] }>("/v1/api-keys");
      setKeys(data.apiKeys);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const generateKey = useCallback(async () => {
    setGenerating(true);
    setNewKey(null);
    setError(null);
    try {
      const payload: Record<string, unknown> = { name: keyName || "default" };
      if (showScoping && scopedPerms.length > 0) {
        payload.permissions = scopedPerms;
      }
      if (expiresAt) {
        payload.expiresAt = new Date(expiresAt).toISOString();
      }
      const data = await apiPost<{ key: string }>("/v1/api-keys", payload);
      setNewKey(data.key);
      setKeyName("");
      setScopedPerms([]);
      setShowScoping(false);
      setExpiresAt("");
      await loadKeys();
    } catch {
      setError(t.common.somethingWentWrong);
    } finally {
      setGenerating(false);
    }
  }, [keyName, showScoping, scopedPerms, expiresAt, loadKeys, t]);

  const copyKey = useCallback(async (key: string) => {
    const ok = await copyToClipboard(key);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const deleteKey = useCallback(
    async (id: number) => {
      if (!confirm(t.settings.apiKeys.deleteConfirm)) return;
      setError(null);
      try {
        await apiDelete(`/v1/api-keys/${id}`);
        await loadKeys();
      } catch {
        setError(t.common.somethingWentWrong);
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
          Expires:
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="px-2 py-1 rounded border border-border bg-background text-xs text-foreground"
            min={new Date().toISOString().slice(0, 16)}
          />
        </label>
        {expiresAt && (
          <button
            type="button"
            onClick={() => setExpiresAt("")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
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
              title="Copy"
              aria-label={t.common.copy}
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
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
                  {k.prefix}... &middot; Created {new Date(k.createdAt).toLocaleDateString()}
                </p>
                {k.permissions && (
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    Scoped: {k.permissions.join(", ")}
                  </p>
                )}
                {k.expiresAt && (
                  <span className="text-xs text-amber-500">
                    Expires {new Date(k.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteKey(k.id)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete key"
                aria-label={t.a11y.deleteKey}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {keys.length === 0 && !newKey && (
        <p className="text-sm text-muted-foreground">{t.settings.apiKeys.emptyState}</p>
      )}
    </div>
  );
}

/* ────────────────────── Teams ────────────────────── */

function TeamsSection() {
  const { t } = useTranslation();
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

  const loadTeams = useCallback(async () => {
    try {
      const data = await apiGet<{ teams: TeamEntry[] }>("/v1/teams");
      setTeams(data.teams);
    } catch {
      setTeams([]);
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
      try {
        await apiPost("/v1/teams", { name: newTeamName.trim() });
        setNewTeamName("");
        setShowCreateForm(false);
        setActionMsg({ type: "success", text: t.settings.teams.createSuccess });
        await loadTeams();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create team";
        setActionMsg({
          type: "error",
          text: msg.includes("409") ? t.settings.teams.duplicateName : msg,
        });
      } finally {
        setCreating(false);
        setTimeout(() => setActionMsg(null), 3000);
      }
    },
    [newTeamName, loadTeams, t.settings.teams.duplicateName, t.settings.teams.createSuccess],
  );

  const handleRename = useCallback(
    async (id: string) => {
      if (!editingTeamName.trim()) return;
      try {
        await apiPut(`/v1/teams/${id}`, { name: editingTeamName.trim() });
        setEditingTeamId(null);
        setEditingTeamName("");
        setActionMsg({ type: "success", text: t.settings.teams.renameSuccess });
        await loadTeams();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to rename team";
        setActionMsg({ type: "error", text: msg });
      }
      setTimeout(() => setActionMsg(null), 3000);
    },
    [editingTeamName, loadTeams, t.settings.teams.renameSuccess],
  );

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (!confirm(format(t.settings.teams.deleteConfirm, { name }))) return;
      try {
        await apiDelete(`/v1/teams/${id}`);
        setActionMsg({ type: "success", text: `Team "${name}" deleted` });
        await loadTeams();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to delete team";
        setActionMsg({
          type: "error",
          text: msg.includes("400") ? t.settings.teams.cannotDeleteDefault : msg,
        });
      }
      setOpenMenuId(null);
      setTimeout(() => setActionMsg(null), 3000);
    },
    [loadTeams, t.settings.teams.deleteConfirm, t.settings.teams.cannotDeleteDefault],
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
      try {
        const body: Record<string, number | null> = {};
        const mbVal = quotaMb.trim() ? Number(quotaMb) : 0;
        body.storageQuota = mbVal > 0 ? mbVal * 1024 * 1024 : null;
        const retVal = retention.trim() ? Number(retention) : 0;
        body.retentionHours = retVal > 0 ? retVal : null;
        await apiPut(`/v1/teams/${id}`, body);
        setActionMsg({ type: "success", text: t.settings.teams.quotaSaved });
        setExpandedTeamId(null);
        await loadTeams();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save";
        setActionMsg({ type: "error", text: msg });
      } finally {
        setSavingQuota(false);
        setTimeout(() => setActionMsg(null), 3000);
      }
    },
    [quotaMb, retention, loadTeams, t.settings.teams.quotaSaved],
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
          className={cn(
            "text-sm px-3 py-2 rounded-lg",
            actionMsg.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-600 dark:text-green-400",
          )}
        >
          {actionMsg.text}
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

        {teams.length === 0 ? (
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
                        className="text-xs text-primary hover:underline"
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
                          {tm.memberCount} {plural(tm.memberCount, "member", "members")}
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
  { label: "Tools", permissions: ["tools:use"] },
  { label: "Files", permissions: ["files:own", "files:all"] },
  { label: "API Keys", permissions: ["apikeys:own", "apikeys:all"] },
  { label: "Pipelines", permissions: ["pipelines:own", "pipelines:all"] },
  { label: "Settings", permissions: ["settings:read", "settings:write"] },
  { label: "Users", permissions: ["users:manage"] },
  { label: "Teams", permissions: ["teams:manage"] },
  {
    label: "System",
    permissions: ["features:manage", "system:health", "audit:read"],
  },
  {
    label: "Enterprise Administration",
    permissions: ["security:manage", "compliance:manage", "webhooks:manage"],
  },
];

function RolesSection() {
  const { t } = useTranslation();
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

  const loadRoles = useCallback(async () => {
    try {
      const data = await apiGet<{ roles: RoleEntry[] }>("/v1/roles");
      setRoles(data.roles);
    } catch {
      setRoles([]);
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
      try {
        await apiPost("/v1/roles", {
          name: newName.trim().toLowerCase(),
          description: newDescription.trim(),
          permissions: newPermissions,
        });
        setNewName("");
        setNewDescription("");
        setNewPermissions([]);
        setShowCreateForm(false);
        setActionMsg({ type: "success", text: t.settings.roles.createSuccess });
        await loadRoles();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create role";
        setActionMsg({
          type: "error",
          text: msg.includes("409") ? t.settings.roles.duplicateRoleError : msg,
        });
      }
      setTimeout(() => setActionMsg(null), 3000);
    },
    [
      newName,
      newDescription,
      newPermissions,
      loadRoles,
      t.settings.roles.duplicateRoleError,
      t.settings.roles.createSuccess,
    ],
  );

  const handleUpdate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingRole) return;
      try {
        await apiPut(`/v1/roles/${editingRole.id}`, {
          name: editName.trim().toLowerCase(),
          description: editDescription.trim(),
          permissions: editPermissions,
        });
        setEditingRole(null);
        setActionMsg({ type: "success", text: t.settings.roles.updateSuccess });
        await loadRoles();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update role";
        setActionMsg({ type: "error", text: msg });
      }
      setTimeout(() => setActionMsg(null), 3000);
    },
    [
      editingRole,
      editName,
      editDescription,
      editPermissions,
      loadRoles,
      t.settings.roles.updateSuccess,
    ],
  );

  const handleDelete = useCallback(
    async (role: RoleEntry) => {
      const msg =
        role.userCount > 0
          ? `Delete role "${role.name}"? ${role.userCount} user${role.userCount !== 1 ? "s" : ""} will need to be reassigned.`
          : `Delete role "${role.name}"?`;
      if (!confirm(msg)) return;
      try {
        await apiDelete(`/v1/roles/${role.id}`);
        setActionMsg({ type: "success", text: `Role "${role.name}" deleted` });
        await loadRoles();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Failed to delete role";
        setActionMsg({ type: "error", text: errMsg });
      }
      setTimeout(() => setActionMsg(null), 3000);
    },
    [loadRoles],
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
          className={cn(
            "text-sm px-3 py-2 rounded-lg",
            actionMsg.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-600 dark:text-green-400",
          )}
        >
          {actionMsg.text}
        </div>
      )}

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

      {/* Create role form */}
      {showCreateForm && (
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
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t.settings.roles.permissionsLabel}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">{group.label}</p>
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
              Create
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
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Edit role form */}
      {editingRole && (
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
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t.settings.roles.permissionsLabel}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">{group.label}</p>
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
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingRole(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Role cards */}
      <div className="space-y-3">
        {roles.length === 0 ? (
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
                  <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {role.userCount} user{role.userCount !== 1 ? "s" : ""}
                  </span>
                </div>
                {!role.isBuiltin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRole(role);
                        setEditName(role.name);
                        setEditDescription(role.description);
                        setEditPermissions([...role.permissions]);
                      }}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit role"
                      aria-label={t.a11y.editRole}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(role)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete role"
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
                {role.permissions.map((perm) => (
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

const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "USER_CREATED",
  "USER_DELETED",
  "USER_UPDATED",
  "FILE_UPLOADED",
  "FILE_DELETED",
  "API_KEY_CREATED",
  "API_KEY_DELETED",
  "ROLE_CREATED",
  "ROLE_UPDATED",
  "ROLE_DELETED",
  "SETTINGS_UPDATED",
  "OIDC_LOGIN_SUCCESS",
  "OIDC_USER_CREATED",
  "OIDC_USER_LINKED",
  "OIDC_LOGIN_FAILED",
  "TOOL_EXECUTED",
  "BATCH_EXECUTED",
  "PIPELINE_EXECUTED",
] as const;

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

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function AuditLogSection() {
  const { t } = useTranslation();
  const isMobile = useMobile();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 25;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (actionFilter) params.set("action", actionFilter);
      const data = await apiGet<{ entries: AuditEntry[]; total: number }>(
        `/v1/audit-log?${params}`,
      );
      setEntries(data.entries);
      setTotal(data.total);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
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
          {AUDIT_ACTIONS.map((a) => (
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
                        {formatRelativeTime(entry.createdAt)}
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
                        {formatRelativeTime(entry.createdAt)}
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
            Page {page} of {totalPages} ({total} entries)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────── Tools ────────────────────── */

function ToolsSection() {
  const { t } = useTranslation();
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showRestartBanner, setShowRestartBanner] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setDisabledTools(
          data.settings.disabledTools ? JSON.parse(data.settings.disabledTools) : [],
        );
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
    setSaveFailed(false);
    try {
      await apiPut("/v1/settings", { disabledTools: JSON.stringify(disabledTools) });
      setShowRestartBanner(true);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [disabledTools]);

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

      {saveFailed && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-700 dark:text-red-400">
          {t.common.somethingWentWrong}
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
          {disabledTools.length} tool{disabledTools.length !== 1 ? "s" : ""} disabled
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
            <span className="text-primary">SnapOtter</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t.settings.about.appDescription}</p>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">Version:</span>
          <span className="font-mono text-foreground">{APP_VERSION}</span>
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
            className="text-sm text-primary hover:underline"
          >
            {t.settings.about.githubLink}
          </a>
          <a
            href="https://docs.snapotter.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {t.settings.about.docsLink}
          </a>
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {t.settings.about.apiRefLink}
          </a>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────── Shared ────────────────────── */

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
