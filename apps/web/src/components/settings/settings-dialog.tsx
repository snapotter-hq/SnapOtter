import { APP_VERSION, CATEGORIES, TOOLS } from "@stirling-image/shared";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Info,
  Key,
  Loader2,
  LogOut,
  Monitor,
  MoreVertical,
  Pencil,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, clearToken, formatHeaders } from "@/lib/api";
import { cn, copyToClipboard } from "@/lib/utils";
import { GemLogo } from "../common/gem-logo";

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
  | "api-keys"
  | "tools"
  | "about";

interface NavItem {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "system", label: "System Settings", icon: Monitor },
  { id: "security", label: "Security", icon: Shield },
  { id: "people", label: "People", icon: Users },
  { id: "teams", label: "Teams", icon: UsersRound },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "about", label: "About", icon: Info },
];

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [section, setSection] = useState<Section>("general");

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl h-[85vh] flex overflow-hidden">
        {/* Sidebar nav */}
        <div className="w-48 border-r border-border bg-muted/30 p-3 space-y-1 shrink-0">
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-sm font-semibold text-foreground">Settings</h2>
          </div>
          {NAV_ITEMS.map((item) => (
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
          >
            <X className="h-4 w-4" />
          </button>

          {section === "general" && <GeneralSection />}
          {section === "system" && <SystemSection />}
          {section === "security" && <SecuritySection />}
          {section === "people" && <PeopleSection />}
          {section === "teams" && <TeamsSection />}
          {section === "api-keys" && <ApiKeysSection />}
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
}

interface UserEntry {
  id: string;
  username: string;
  role: string;
  team: string;
  createdAt: string;
}

interface TeamEntry {
  id: number;
  name: string;
  memberCount: number;
  createdAt: string;
}

/* ────────────────────── General ────────────────────── */

function GeneralSection() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ user: SessionUser }>("/auth/session")
      .then((data) => setUser(data.user))
      .catch(() => {
        // Fallback to localStorage if session endpoint fails
        setUser({
          id: 0,
          username: localStorage.getItem("stirling-username") || "admin",
          role: "admin",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    clearToken();
    localStorage.removeItem("stirling-username");
    window.location.href = "/login";
  };

  const username = user?.username || "admin";
  const role = user?.role || "admin";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">General</h3>
        <p className="text-sm text-muted-foreground mt-1">User preferences and display settings.</p>
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
            <p className="font-medium text-foreground">{loading ? "Loading..." : username}</p>
            <p className="text-xs text-muted-foreground capitalize">{role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Log out
        </button>
      </div>

      {/* Default view */}
      <SettingRow label="Default Tool View" description="How tools are displayed on the home page">
        <select className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground">
          <option value="sidebar">Sidebar</option>
          <option value="fullscreen">Fullscreen Grid</option>
        </select>
      </SettingRow>

      {/* Version */}
      <SettingRow label="App Version" description="Current version of Stirling Image">
        <span className="text-sm font-mono text-muted-foreground">{APP_VERSION}</span>
      </SettingRow>
    </div>
  );
}

/* ────────────────────── System ────────────────────── */

function SystemSection() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => {
        // Fallback defaults if endpoint not ready
        setSettings({
          appName: "Stirling Image",
          fileUploadLimitMb: "100",
          defaultTheme: "system",
          defaultLocale: "en",
          loginAttemptLimit: "5",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await apiPut("/v1/settings", settings);
      setSaveMsg("Settings saved.");
    } catch {
      setSaveMsg("Failed to save settings.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      await fetch("/api/v1/settings/logo", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });
      setSettings((prev) => ({ ...prev, customLogo: "true" }));
    } catch {
      setSaveMsg("Failed to upload logo.");
    }
  };

  const handleLogoDelete = async () => {
    try {
      await apiDelete("/v1/settings/logo");
      setSettings((prev) => ({ ...prev, customLogo: "false" }));
    } catch {
      setSaveMsg("Failed to delete logo.");
    }
  };

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
        <h3 className="text-lg font-semibold text-foreground">System Settings</h3>
        <p className="text-sm text-muted-foreground mt-1">Server-side configuration and limits.</p>
      </div>

      <SettingRow label="App Name" description="Display name for the application">
        <input
          type="text"
          value={settings.appName || ""}
          onChange={(e) => updateSetting("appName", e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-48"
        />
      </SettingRow>

      <SettingRow
        label="Custom Logo"
        description="Upload a custom logo for the sidebar. PNG, SVG, or JPEG. Max 500KB."
      >
        <div className="flex items-center gap-3">
          {settings.customLogo === "true" && (
            <img
              src="/api/v1/settings/logo"
              className="w-10 h-10 rounded object-contain"
              alt="Logo"
            />
          )}
          <label
            htmlFor="system-logo-upload"
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm cursor-pointer hover:bg-muted transition-colors"
          >
            Upload
            <input
              id="system-logo-upload"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={handleLogoUpload}
            />
          </label>
          {settings.customLogo === "true" && (
            <button
              type="button"
              onClick={handleLogoDelete}
              className="text-sm text-destructive hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      </SettingRow>

      <SettingRow label="File Upload Limit (MB)" description="Maximum file size per upload">
        <input
          type="number"
          value={settings.fileUploadLimitMb || "100"}
          onChange={(e) => updateSetting("fileUploadLimitMb", e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={1}
        />
      </SettingRow>

      <SettingRow label="Default Theme" description="Theme applied for new sessions">
        <select
          value={settings.defaultTheme || "system"}
          onChange={(e) => updateSetting("defaultTheme", e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </SettingRow>

      <SettingRow label="Language" description="Language for the interface">
        <select
          value={settings.defaultLocale || "en"}
          onChange={(e) => updateSetting("defaultLocale", e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
        >
          <option value="en">English</option>
        </select>
      </SettingRow>

      <SettingRow
        label="Login Attempt Limit"
        description="Max failed login attempts per minute before lockout"
      >
        <input
          type="number"
          value={settings.loginAttemptLimit || "5"}
          onChange={(e) => updateSetting("loginAttemptLimit", e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={1}
          max={100}
        />
      </SettingRow>

      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground mb-3">File Management</h4>
      </div>
      <SettingRow
        label="Max File Age (hours)"
        description="How long processed files are kept before automatic cleanup"
      >
        <input
          type="number"
          value={settings.tempFileMaxAgeHours || "24"}
          onChange={(e) => updateSetting("tempFileMaxAgeHours", e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-24"
          min={1}
        />
      </SettingRow>
      <SettingRow
        label="Startup Cleanup"
        description="Clean up old temporary files when the server starts"
      >
        <button
          type="button"
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

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save Settings
        </button>
        {saveMsg && (
          <span
            className={cn(
              "text-sm",
              saveMsg.includes("Failed")
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

/* ────────────────────── Security ────────────────────── */

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChangePassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
        setMessage({ type: "error", text: "Passwords do not match" });
        return;
      }
      if (newPassword.length < 4) {
        setMessage({ type: "error", text: "Password must be at least 4 characters" });
        return;
      }

      setSubmitting(true);
      setMessage(null);
      try {
        await apiPost("/auth/change-password", { currentPassword, newPassword });
        setMessage({ type: "success", text: "Password changed successfully" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to change password";
        setMessage({
          type: "error",
          text: msg.includes("401") ? "Current password is incorrect" : msg,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [currentPassword, newPassword, confirmPassword],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Security</h3>
        <p className="text-sm text-muted-foreground mt-1">Password and authentication settings.</p>
      </div>

      <form onSubmit={handleChangePassword} className="space-y-4">
        <h4 className="text-sm font-medium text-foreground">Change Password</h4>

        <div className="space-y-3 max-w-sm">
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current Password"
              className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm text-foreground"
              required
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
            <input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New Password"
              className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm text-foreground"
              required
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm New Password"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            required
          />

          {message && (
            <p
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
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Change Password
          </button>
        </div>
      </form>

      <div className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Login attempt limits can be configured in System Settings.
        </p>
      </div>
    </div>
  );
}

/* ────────────────────── People ────────────────────── */

function PeopleSection() {
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

  const atLimit = users.length >= maxUsers;

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
        setActionMsg({ type: "success", text: "User created successfully" });
        await loadUsers();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create user";
        setAddError(msg.includes("403") ? `User limit reached (${maxUsers} max)` : msg);
      } finally {
        setAdding(false);
        setTimeout(() => setActionMsg(null), 3000);
      }
    },
    [newUsername, newPassword, newRole, newTeam, maxUsers, loadUsers],
  );

  const handleDeleteUser = useCallback(
    async (id: string, username: string) => {
      if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
      try {
        await apiDelete(`/auth/users/${id}`);
        setActionMsg({ type: "success", text: `User "${username}" deleted` });
        await loadUsers();
      } catch {
        setActionMsg({ type: "error", text: "Failed to delete user" });
      }
      setOpenMenuId(null);
      setTimeout(() => setActionMsg(null), 3000);
    },
    [loadUsers],
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
        setActionMsg({ type: "success", text: "User updated" });
        await loadUsers();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update user";
        setActionMsg({
          type: "error",
          text: msg.includes("400") ? "Cannot remove your own admin role" : msg,
        });
      }
      setTimeout(() => setActionMsg(null), 3000);
    },
    [editingUser, editRole, editTeam, loadUsers],
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
        setActionMsg({ type: "success", text: "Password reset successfully" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to reset password";
        setActionMsg({ type: "error", text: msg });
      }
      setTimeout(() => setActionMsg(null), 3000);
    },
    [resetPasswordUser, resetPassword],
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
        <h3 className="text-lg font-semibold text-foreground">People</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Manage workspace members and their permissions
        </p>
      </div>

      {/* User count */}
      <p className="text-sm text-muted-foreground">
        {users.length} / {maxUsers} users
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
            placeholder="Search members..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
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
          title={atLimit ? `User limit reached (${maxUsers} max)` : "Add a new member"}
        >
          <UserPlus className="h-4 w-4" />
          Add Members
        </button>
      </div>

      {/* Add user form */}
      {showAddForm && (
        <form
          onSubmit={handleAddUser}
          className="p-4 rounded-lg border border-border bg-muted/20 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">New Member</h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Username"
              required
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={8}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={newTeam}
              onChange={(e) => setNewTeam(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
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
              {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
        </form>
      )}

      {/* Edit user modal */}
      {editingUser && (
        <form
          onSubmit={handleUpdateUser}
          className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">Edit {editingUser.username}</h4>
          <div className="flex flex-wrap gap-3">
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={editTeam}
              onChange={(e) => setEditTeam(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground w-40"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
              {teams.length === 0 && <option value="Default">Default</option>}
            </select>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Reset password modal */}
      {resetPasswordUser && (
        <form
          onSubmit={handleResetPassword}
          className="p-4 rounded-lg border border-orange-500/30 bg-orange-500/5 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">
            Reset password for {resetPasswordUser.username}
          </h4>
          <div className="flex flex-wrap gap-3">
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              required
              minLength={8}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground w-60"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
            >
              Reset Password
            </button>
            <button
              type="button"
              onClick={() => {
                setResetPasswordUser(null);
                setResetPassword("");
              }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            This will invalidate all sessions and API keys for this user.
          </p>
        </form>
      )}

      {/* Users table */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_100px_120px_60px] gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <span>User</span>
          <span>Role</span>
          <span>Team</span>
          <span />
        </div>

        {/* Table rows */}
        {filteredUsers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {search ? "No members match your search." : "No users found."}
          </div>
        ) : (
          filteredUsers.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[1fr_100px_120px_60px] gap-2 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
            >
              {/* User cell */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                  {u.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground truncate">{u.username}</span>
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

              {/* Actions */}
              <div className="flex items-center gap-1 justify-end relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === u.id ? null : u.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Actions"
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
                      Edit Role / Team
                    </button>
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
                      Reset Password
                    </button>
                    <div className="border-t border-border my-1" />
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u.id, u.username)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete User
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
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [keyName, setKeyName] = useState("");

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
    try {
      const data = await apiPost<{ key: string }>("/v1/api-keys", {
        name: keyName || "default",
      });
      setNewKey(data.key);
      setKeyName("");
      await loadKeys();
    } catch {
      // Silently fail
    } finally {
      setGenerating(false);
    }
  }, [keyName, loadKeys]);

  const copyKey = useCallback(async (key: string) => {
    const ok = await copyToClipboard(key);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const deleteKey = useCallback(
    async (id: number) => {
      if (!confirm("Delete this API key? Any integrations using it will stop working.")) return;
      try {
        await apiDelete(`/v1/api-keys/${id}`);
        await loadKeys();
      } catch {
        // Silently fail
      }
    },
    [loadKeys],
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
        <h3 className="text-lg font-semibold text-foreground">API Keys</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Manage API keys for programmatic access to Stirling Image.
        </p>
      </div>

      {/* Generate new key */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder="Key name (optional)"
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground w-48"
        />
        <button
          type="button"
          onClick={generateKey}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
          Generate API Key
        </button>
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
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Store this key securely. It will not be shown again.
          </p>
        </div>
      )}

      {/* Existing keys list */}
      {keys.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">Existing Keys</h4>
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
              </div>
              <button
                type="button"
                onClick={() => deleteKey(k.id)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete key"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {keys.length === 0 && !newKey && (
        <p className="text-sm text-muted-foreground">
          No API keys yet. Generate one to get started.
        </p>
      )}
    </div>
  );
}

/* ────────────────────── Teams ────────────────────── */

function TeamsSection() {
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
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
        setActionMsg({ type: "success", text: "Team created successfully" });
        await loadTeams();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create team";
        setActionMsg({
          type: "error",
          text: msg.includes("409") ? "A team with that name already exists" : msg,
        });
      } finally {
        setCreating(false);
        setTimeout(() => setActionMsg(null), 3000);
      }
    },
    [newTeamName, loadTeams],
  );

  const handleRename = useCallback(
    async (id: number) => {
      if (!editingTeamName.trim()) return;
      try {
        await apiPut(`/v1/teams/${id}`, { name: editingTeamName.trim() });
        setEditingTeamId(null);
        setEditingTeamName("");
        setActionMsg({ type: "success", text: "Team renamed" });
        await loadTeams();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to rename team";
        setActionMsg({ type: "error", text: msg });
      }
      setTimeout(() => setActionMsg(null), 3000);
    },
    [editingTeamName, loadTeams],
  );

  const handleDelete = useCallback(
    async (id: number, name: string) => {
      if (!confirm(`Delete team "${name}"? Members will be unassigned.`)) return;
      try {
        await apiDelete(`/v1/teams/${id}`);
        setActionMsg({ type: "success", text: `Team "${name}" deleted` });
        await loadTeams();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to delete team";
        setActionMsg({
          type: "error",
          text: msg.includes("400") ? "Cannot delete the default team or a team with members" : msg,
        });
      }
      setOpenMenuId(null);
      setTimeout(() => setActionMsg(null), 3000);
    },
    [loadTeams],
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
        <h3 className="text-lg font-semibold text-foreground">Teams</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Organize members into teams for better management.
        </p>
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
          Create New Team
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-lg border border-border bg-muted/20 space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">New Team</h4>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name"
              required
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground flex-1"
            />
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_60px] gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <span>Team Name</span>
          <span>Members</span>
          <span />
        </div>

        {teams.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No teams found.</div>
        ) : (
          teams.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[1fr_100px_60px] gap-2 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
            >
              <div className="min-w-0">
                {editingTeamId === t.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingTeamName}
                      onChange={(e) => setEditingTeamName(e.target.value)}
                      className="px-2 py-1 rounded border border-border bg-background text-sm text-foreground w-40"
                      ref={(el) => el?.focus()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(t.id);
                        if (e.key === "Escape") setEditingTeamId(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRename(t.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTeamId(null)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className="text-sm font-medium text-foreground truncate">{t.name}</span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">{t.memberCount}</span>
              <div className="flex items-center gap-1 justify-end relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === t.id ? null : t.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {openMenuId === t.id && (
                  <div
                    role="menu"
                    className="absolute right-0 top-8 z-50 w-36 rounded-lg border border-border bg-background shadow-lg py-1"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTeamId(t.id);
                        setEditingTeamName(t.name);
                        setOpenMenuId(null);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename
                    </button>
                    <div className="border-t border-border my-1" />
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id, t.name)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
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

/* ────────────────────── Tools ────────────────────── */

function ToolsSection() {
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showRestartBanner, setShowRestartBanner] = useState(false);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setDisabledTools(
          data.settings.disabledTools ? JSON.parse(data.settings.disabledTools) : [],
        );
      })
      .catch(() => {})
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
    try {
      await apiPut("/v1/settings", { disabledTools: JSON.stringify(disabledTools) });
      setShowRestartBanner(true);
    } catch {
      /* handle error */
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
        <h3 className="text-lg font-semibold text-foreground">Tools</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Enable or disable individual tools. Disabled tools are hidden from all users.
        </p>
      </div>

      {showRestartBanner && (
        <div className="px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-700 dark:text-amber-400">
          Restart required for changes to take effect.
        </div>
      )}

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div className="space-y-4 max-h-[50vh] overflow-y-auto">
        {CATEGORIES.filter((cat) => groupedTools.has(cat.id)).map((category) => (
          <div key={category.id}>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
              {category.name}
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
                      <p className="text-sm font-medium text-foreground">{tool.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleTool(tool.id)}
                      className={cn(
                        "w-11 h-6 rounded-full transition-colors relative shrink-0 ml-3",
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
          No tools match your search.
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save Tool Settings
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
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">About</h3>
      </div>

      <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-3">
        <div className="flex items-center gap-3">
          <GemLogo className="h-8 w-8 text-primary" />
          <div className="text-2xl font-bold text-foreground">
            Stirling <span className="text-primary">Image</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          A self-hosted, privacy-first image processing suite with 30+ tools. Resize, compress,
          convert, watermark, and automate your image workflows without sending data to the cloud.
        </p>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">Version:</span>
          <span className="font-mono text-foreground">{APP_VERSION}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Links</h4>
        <div className="flex flex-col gap-1.5">
          <a
            href="https://github.com/stirling-image/stirling-image"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GitHub Repository
          </a>
          <a
            href="https://stirling-image.github.io/stirling-image/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Documentation
          </a>
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            API Reference (Swagger)
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
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 ml-4">{children}</div>
    </div>
  );
}
