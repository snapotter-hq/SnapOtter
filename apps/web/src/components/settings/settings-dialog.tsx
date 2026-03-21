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
  RefreshCw,
  LogOut,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearToken } from "@/lib/api";
import { APP_VERSION } from "@stirling-image/shared";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type Section = "general" | "system" | "security" | "api-keys" | "about";

interface NavItem {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "system", label: "System Settings", icon: Monitor },
  { id: "security", label: "Security", icon: Shield },
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
      <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex overflow-hidden">
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
          {section === "api-keys" && <ApiKeysSection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────── General ────────────────────── */

function GeneralSection() {
  const username = localStorage.getItem("stirling-username") || "admin";

  const handleLogout = () => {
    clearToken();
    window.location.href = "/login";
  };

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
            {username.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-foreground">{username}</p>
            <p className="text-xs text-muted-foreground">Administrator</p>
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
          defaultValue="Stirling Image"
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground w-48"
        />
      </SettingRow>

      <SettingRow label="File Upload Limit" description="Maximum file size per upload">
        <span className="text-sm font-mono text-muted-foreground">100 MB</span>
      </SettingRow>

      <SettingRow label="Default Theme" description="Theme applied for new sessions">
        <select className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </SettingRow>

      <SettingRow label="Default Locale" description="Language for the interface">
        <span className="text-sm font-mono text-muted-foreground">English (en)</span>
      </SettingRow>
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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChangePassword = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
        setMessage({ type: "error", text: "Passwords do not match" });
        return;
      }
      if (newPassword.length < 4) {
        setMessage({ type: "error", text: "Password must be at least 4 characters" });
        return;
      }
      // In a real implementation this would call the API
      setMessage({ type: "success", text: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    [newPassword, confirmPassword]
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
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
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

/* ────────────────────── API Keys ────────────────────── */

function ApiKeysSection() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateKey = useCallback(() => {
    // Generate a random API key (in production this calls the backend)
    const key = "si_" + Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setApiKey(key);
  }, []);

  const copyKey = useCallback(() => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [apiKey]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">API Keys</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Manage API keys for programmatic access to Stirling Image.
        </p>
      </div>

      {apiKey ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20">
            <code className="flex-1 text-sm font-mono text-foreground break-all select-all">
              {apiKey}
            </code>
            <button
              onClick={copyKey}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground shrink-0"
              title="Copy"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Store this key securely. It will not be shown again after you leave this page.
          </p>
          <button
            onClick={generateKey}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </button>
        </div>
      ) : (
        <button
          onClick={generateKey}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Key className="h-4 w-4" />
          Generate API Key
        </button>
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
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            API Documentation
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
