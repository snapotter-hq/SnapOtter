import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";

/**
 * Trigger the browser's "Save Password" prompt by submitting a real form
 * with the new credentials and causing a page navigation.
 *
 * Safari (and most browsers) only offer to save passwords when they detect:
 *   1. A real HTMLFormElement.submit() call (not fetch / XHR)
 *   2. Visible input fields with autocomplete="username" + "new-password"
 *   3. An actual page navigation following the submission
 *
 * We POST to "/" which the SPA serves as index.html. The browser sees the
 * form submission + navigation and prompts to save.
 */
function triggerBrowserPasswordSave(username: string, password: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/";
  form.style.position = "fixed";
  form.style.top = "-9999px";

  const uField = document.createElement("input");
  uField.type = "text";
  uField.name = "username";
  uField.autocomplete = "username";
  uField.value = username;
  form.appendChild(uField);

  const pField = document.createElement("input");
  pField.type = "password";
  pField.name = "password";
  pField.autocomplete = "new-password";
  pField.value = password;
  form.appendChild(pField);

  document.body.appendChild(form);
  form.submit();
  // The form.submit() causes a full page navigation to "/", so no cleanup needed.
}

function secureRandom(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function generatePassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const all = upper + lower + digits;
  const required = [
    upper[secureRandom(upper.length)],
    lower[secureRandom(lower.length)],
    digits[secureRandom(digits.length)],
  ];
  const rest = Array.from({ length: 13 }, () => all[secureRandom(all.length)]);
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandom(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function ChangePasswordPage() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showGenerated, setShowGenerated] = useState(false);

  const handleGenerate = () => {
    const pw = generatePassword();
    setNewPassword(pw);
    setConfirmPassword(pw);
    setShowGenerated(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError(t.changePassword.passwordsMismatch);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: formatHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to change password");
        return;
      }

      localStorage.setItem("snapotter-welcome", "1");
      // Trigger browser password save prompt via real form submission + navigation
      const username = localStorage.getItem("snapotter-username") || "admin";
      triggerBrowserPasswordSave(username, newPassword);
      return; // navigation happens inside triggerBrowserPasswordSave
    } catch {
      setError(t.changePassword.failedError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-dvh bg-background">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              <span className="text-primary-ink">SnapOtter</span>
            </h1>
            <h2 className="text-2xl font-bold mt-4 text-foreground">{t.changePassword.title}</h2>
            <p className="text-sm text-muted-foreground mt-2">{t.changePassword.description}</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-1 text-foreground">
                {t.changePassword.usernameLabel}
              </label>
              <input
                id="username"
                type="text"
                name="username"
                autoComplete="username"
                value={localStorage.getItem("snapotter-username") || "admin"}
                readOnly
                className="w-full px-4 py-3 rounded-lg border border-border bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>
            <div>
              <label
                htmlFor="current-password"
                className="block text-sm font-medium mb-1 text-foreground"
              >
                {t.changePassword.currentPasswordLabel}
              </label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t.changePassword.currentPasswordPlaceholder}
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="new-password" className="text-sm font-medium text-foreground">
                  {t.changePassword.newPasswordLabel}
                </label>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/10 text-xs text-primary-ink hover:bg-primary/20 font-medium transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  {t.changePassword.generateButton}
                </button>
              </div>
              <input
                id="new-password"
                type={showGenerated ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setShowGenerated(false);
                }}
                placeholder={t.changePassword.newPasswordPlaceholder}
                className={`w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 ${showGenerated ? "font-mono text-sm" : ""}`}
                required
                minLength={8}
              />
            </div>
            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium mb-1 text-foreground"
              >
                {t.changePassword.confirmPasswordLabel}
              </label>
              <input
                id="confirm-password"
                type={showGenerated ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setShowGenerated(false);
                }}
                placeholder={t.changePassword.confirmPasswordPlaceholder}
                className={`w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 ${showGenerated ? "font-mono text-sm" : ""}`}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              className="w-full py-3 rounded-lg bg-primary/80 text-primary-foreground font-medium hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t.changePassword.changingButton : t.changePassword.changeButton}
            </button>
          </form>
        </div>
      </div>
      <div className="hidden lg:flex flex-1 bg-primary/90 items-center justify-center p-12 text-primary-foreground rounded-s-3xl">
        <div className="max-w-lg space-y-6 text-center">
          <span className="text-7xl">🦦</span>
          <h2 className="text-3xl font-bold">{t.changePassword.sidebarTitle}</h2>
          <p className="text-lg text-primary-foreground">{t.changePassword.sidebarDescription}</p>
        </div>
      </div>
    </div>
  );
}
