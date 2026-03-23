import { useState, useCallback, useEffect } from "react";
import {
  X,
  Settings,
  Shield,
  Key,
  Info,
  Eye,
  EyeOff,
  Copy,
  Check,
  LogOut,
  Monitor,
  Users,
  Trash2,
  Plus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPut, apiDelete, clearToken } from "@/lib/api";
import { APP_VERSION } from "@stirling-image/shared";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type Section = "general" | "system" | "security" | "people" | "api-keys" | "about";

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
  { id: "api-keys", label: "API Keys", icon: Key },
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
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
              onClick={() => setSection(item.id)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                section === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          {section === "general" && <GeneralSection />}
          {section === "system" && <SystemSection />}
          {section === "security" && <SecuritySection />}
          {section === "people" && <PeopleSection />}
          {section === "api-keys" && <ApiKeysSection />}
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
  id: number;
  username: string;
  role: string;
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
        <p className="text-sm text-muted-foreground mt-1">
          User preferences and display settings.
        </p>
      </div>

      {/* User info */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : username.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-foreground">{loading ? "Loading..." : username}</p>
            <p className="text-xs text-muted-foreground capitalize">{role}</p>
          </div>
        </div>
        <button
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
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = useCallback(
    (key: string, value: string) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

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
        <p className="text-sm text-muted-foreground mt-1">
          Server-side configuration and limits.
        </p>
      </div>

      <SettingRow label="App Name" description="Display name for the application">
        <input
          type="text"
          value={settings.appName || ""}
          onChange={(e) => updateSetting("appName", e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-48"
        />
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

      <SettingRow label="Default Locale" description="Language for the interface">
        <select
          value={settings.defaultLocale || "en"}
          onChange={(e) => updateSetting("defaultLocale", e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
        >
          <option value="en">English (en)</option>
          <option value="es">Spanish (es)</option>
          <option value="fr">French (fr)</option>
          <option value="de">German (de)</option>
          <option value="zh">Chinese (zh)</option>
          <option value="ja">Japanese (ja)</option>
        </select>
      </SettingRow>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save Settings
        </button>
        {saveMsg && (
          <span className={cn("text-sm", saveMsg.includes("Failed") ? "text-destructive" : "text-green-600 dark:text-green-400")}>
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
        setMessage({ type: "error", text: msg.includes("401") ? "Current password is incorrect" : msg });
      } finally {
        setSubmitting(false);
      }
    },
    [currentPassword, newPassword, confirmPassword]
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Security</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Password and authentication settings.
        </p>
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
                message.type === "error" ? "text-destructive" : "text-green-600 dark:text-green-400"
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
        <SettingRow label="Login Attempt Limit" description="Max failed attempts before lockout">
          <span className="text-sm font-mono text-muted-foreground">5 attempts</span>
        </SettingRow>
      </div>
    </div>
  );
}

/* ────────────────────── People ────────────────────── */

function PeopleSection() {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiGet<{ users: UserEntry[] }>("/auth/users");
      setUsers(data.users);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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
        });
        setNewUsername("");
        setNewPassword("");
        setNewRole("user");
        setShowAddForm(false);
        await loadUsers();
      } catch (err) {
        setAddError(err instanceof Error ? err.message : "Failed to create user");
      } finally {
        setAdding(false);
      }
    },
    [newUsername, newPassword, newRole, loadUsers]
  );

  const handleDeleteUser = useCallback(
    async (id: number, username: string) => {
      if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
      try {
        await apiDelete(`/auth/users/${id}`);
        await loadUsers();
      } catch {
        // Silently fail - user likely lacks permission
      }
    },
    [loadUsers]
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">People</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage users and their roles.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add User
        </button>
      </div>

      {/* Add user form */}
      {showAddForm && (
        <form onSubmit={handleAddUser} className="p-4 rounded-lg border border-border bg-muted/20 space-y-3">
          <h4 className="text-sm font-medium text-foreground">New User</h4>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Username"
              required
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground w-40"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={4}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground w-40"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
          </div>
          {addError && (
            <p className="text-sm text-destructive">{addError}</p>
          )}
        </form>
      )}

      {/* User list */}
      <div className="space-y-1">
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No users found.</p>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                  {u.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{u.username}</p>
                  <p className="text-xs text-muted-foreground capitalize">{u.role}</p>
                </div>
              </div>
              <button
                onClick={() => handleDeleteUser(u.id, u.username)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title={`Delete ${u.username}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
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

  const copyKey = useCallback((key: string) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
    [loadKeys]
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
        <p className="text-sm text-muted-foreground">No API keys yet. Generate one to get started.</p>
      )}
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
          <div className="text-2xl font-bold text-foreground">
            Stirling <span className="text-primary">Image</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          A self-hosted, privacy-first image processing suite with 37+ tools.
          Resize, compress, convert, watermark, and automate your image workflows
          without sending data to the cloud.
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
            href="https://github.com/siddharthksah/Stirling-Image"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GitHub Repository
          </a>
          <a
            href="https://siddharthksah.github.io/Stirling-Image/"
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
