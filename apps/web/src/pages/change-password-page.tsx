import { Check, Copy, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { CopyFeedback } from "@/components/common/copy-feedback";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { clearToken, formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { generatePassword, passwordLengthFor } from "@/lib/generate-password";
import { passwordErrorMessages } from "@/lib/password-errors";
import { cn, copyToClipboard } from "@/lib/utils";

/**
 * Trigger the browser's "Save Password" prompt by submitting a real form
 * with the new credentials and causing a page navigation.
 *
 * Safari (and most browsers) only offer to save passwords when they detect:
 *   1. A real HTMLFormElement.submit() call (not fetch / XHR)
 *   2. Visible input fields with autocomplete="username" + "new-password"
 *   3. An actual page navigation following the submission
 *
 * We POST to "/", which the API answers with a 303 back to the app (static.ts,
 * #2088; a plain 404 there would end the flow on "Not found"). The browser sees the
 * form submission + navigation and prompts to save.
 */
function triggerBrowserPasswordSave(username: string, password: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = appUrl("/");
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

/** The name an earlier login left in storage, if storage can be read at all. */
function storedUsername(): string | null {
  try {
    return localStorage.getItem("snapotter-username");
  } catch {
    // Storage blocked (a private window with site data blocked).
    return null;
  }
}

/** Drop the stored token without letting a blocked-storage throw hide the refusal. */
function forgetToken(): void {
  try {
    clearToken();
  } catch {
    // Storage blocked: the session cookie still governs auth state.
  }
}

/**
 * What happens once the server has changed the password. None of it may be
 * reported as a failed change: the password is already different, so telling
 * the user it failed sends their next attempt in with a wrong current
 * password (#1569). Blocked storage is ignored; a form the browser won't
 * submit falls back to a plain navigation to the app.
 */
function finishPasswordChange(username: string, newPassword: string) {
  try {
    localStorage.setItem("snapotter-welcome", "1");
  } catch {
    // Storage blocked or full (private window): the welcome flag is a nicety.
  }
  try {
    // Trigger browser password save prompt via real form submission + navigation
    triggerBrowserPasswordSave(username, newPassword);
  } catch (err) {
    console.warn("Save-password form failed; navigating to the app instead", err);
    window.location.assign(appUrl("/"));
  }
}

export function ChangePasswordPage() {
  const { t } = useTranslation();
  // The session knows who is signed in; storage is only what an earlier login
  // left behind, which can be another account's name or nothing at all (#2317).
  const { username: sessionUsername } = useAuth();
  const username = sessionUsername || storedUsername() || "admin";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showGenerated, setShowGenerated] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  // The minimum length from the server's last refusal. This page can't read the
  // policy, so Generate starts at the default and meets the minimum once the
  // server has named it (#2027).
  const [minLength, setMinLength] = useState<number | null>(null);

  const handleGenerate = () => {
    const pw = generatePassword(passwordLengthFor(minLength));
    setNewPassword(pw);
    setConfirmPassword(pw);
    setShowGenerated(true);
    setCopyStatus(null);
  };

  // Generate swaps itself for the generated-password panel, so move focus to
  // that panel's Copy button rather than dropping it on the body.
  useEffect(() => {
    if (showGenerated) copyButtonRef.current?.focus();
  }, [showGenerated]);

  useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setCopyStatus(null), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  const handleCopy = async () => {
    setCopyStatus((await copyToClipboard(newPassword)) ? "copied" : "failed");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setSessionEnded(false);

    if (newPassword !== confirmPassword) {
      setErrors([t.changePassword.passwordsMismatch]);
      return;
    }

    setLoading(true);
    let changed = false;
    try {
      const res = await fetch(appUrl("/api/auth/change-password"), {
        method: "POST",
        headers: formatHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // A 401 that isn't a wrong current password means the session is
        // gone (expired, idle, or ended by an admin's password reset).
        // Retrying here can't work, so point back to sign-in.
        if (res.status === 401 && data.code !== "INVALID_PASSWORD") {
          forgetToken();
          setSessionEnded(true);
          setErrors([t.changePassword.sessionEnded]);
          return;
        }
        // Another change won (another tab, an admin reset, or SCIM): the old
        // password will never verify again, so drop the token and link to sign-in (#2236).
        if (data.code === "PASSWORD_CHANGED") {
          forgetToken();
          setSessionEnded(true);
        }
        if (typeof data.minLength === "number") setMinLength(data.minLength);
        const messages = passwordErrorMessages(t, res.status, data);
        if (messages.length === 0) {
          console.warn("Password change failed", { status: res.status, code: data.code });
        }
        setErrors(messages.length > 0 ? messages : [t.changePassword.failedError]);
        return;
      }
      changed = true;
    } catch {
      setErrors([t.changePassword.failedError]);
      return;
    } finally {
      // After a success the page is about to navigate; a live button would let a
      // second click resend the old current password.
      if (!changed) setLoading(false);
    }

    finishPasswordChange(username, newPassword); // navigates away
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex h-dvh bg-background">
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
                value={username}
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
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            {showGenerated ? (
              <div className="flex gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/15 text-success-ink">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {t.changePassword.generatedTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.changePassword.generatedHint}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      ref={copyButtonRef}
                      type="button"
                      onClick={handleCopy}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        copyStatus === "copied"
                          ? "border-green-500/40 bg-green-500/10 text-success-ink"
                          : "border-border bg-background text-foreground hover:bg-muted",
                      )}
                    >
                      {copyStatus === "copied" ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {copyStatus === "copied"
                        ? t.common.copied
                        : copyStatus === "failed"
                          ? t.common.copyFailed
                          : t.common.copy}
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-medium text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      {t.changePassword.regenerateButton}
                    </button>
                    <CopyFeedback status={copyStatus} />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    aria-describedby="generate-hint"
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-center bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/25 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Wand2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t.changePassword.generateForMeButton}
                  </button>
                  <p
                    id="generate-hint"
                    className="mt-1.5 text-center text-xs text-muted-foreground"
                  >
                    {t.changePassword.generateHint}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {t.common.or}
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}
            <div>
              <label
                htmlFor="new-password"
                className="block text-sm font-medium mb-1 text-foreground"
              >
                {t.changePassword.newPasswordLabel}
              </label>
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
                className={`w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${showGenerated ? "font-mono text-sm" : ""}`}
                required
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
                className={`w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${showGenerated ? "font-mono text-sm" : ""}`}
                required
              />
            </div>
            {errors.length === 1 && (
              <p role="alert" className="text-sm text-destructive">
                {errors[0]}
                {sessionEnded && (
                  <>
                    {" "}
                    <a href={appUrl("/login")} className="underline">
                      {t.auth.loginButton}
                    </a>
                  </>
                )}
              </p>
            )}
            {errors.length > 1 && (
              <div role="alert" className="text-sm text-destructive">
                <ul className="list-disc ps-5 space-y-1">
                  {errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
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
    </main>
  );
}
