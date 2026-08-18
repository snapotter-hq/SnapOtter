import { KeyRound } from "lucide-react";
import QRCodeStyling from "qr-code-styling";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { setToken } from "@/lib/api";
import { format } from "@/lib/format";
import { copyToClipboard } from "@/lib/utils";

function parseManualSecret(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

function QrCode({ uri }: { uri: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const qr = new QRCodeStyling({
      width: 200,
      height: 200,
      data: uri,
      margin: 8,
      dotsOptions: { type: "square", color: "#000000" },
      backgroundOptions: { color: "#ffffff" },
    } as never);
    const el = containerRef.current;
    if (el) {
      while (el.firstChild) el.removeChild(el.firstChild);
      qr.append(el);
    }
  }, [uri]);

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center rounded-xl border border-border p-4 bg-white w-fit"
    />
  );
}

function RotatingPhrase() {
  const { t } = useTranslation();
  const phrases = t.auth.rotatingPhrases;
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const advance = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setIndex((i) => (i + 1) % phrases.length);
      setVisible(true);
    }, 300);
  }, [phrases.length]);

  useEffect(() => {
    const timer = setInterval(advance, 3000);
    return () => clearInterval(timer);
  }, [advance]);

  return (
    <span
      className="inline-block transition-all duration-300 text-primary-foreground"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-8px)",
      }}
    >
      {phrases[index]}
    </span>
  );
}

function LanguageSelector() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const current = supportedLocales.find((l) => l.code === locale);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground transition-colors px-3 py-2 rounded-lg border border-border hover:bg-muted/50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label={t.a11y.language}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
        {current?.nativeName ?? "English"}
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 w-56 max-h-64 overflow-y-auto rounded-lg border border-border bg-background shadow-lg z-50">
          {supportedLocales.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
              className="w-full text-start px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between transition-colors"
            >
              <span
                className={l.code === locale ? "font-medium text-foreground" : "text-foreground"}
              >
                {l.nativeName}
              </span>
              {l.code === locale && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary shrink-0"
                  role="img"
                  aria-label={t.a11y.selected}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { oidcEnabled, oidcProviderName, samlEnabled, samlProviderName, ssoEnforced } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMfaPrompt, setShowMfaPrompt] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const mfaInputRef = useRef<HTMLInputElement>(null);
  const [showMfaEnrollment, setShowMfaEnrollment] = useState(false);
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [enrollmentUri, setEnrollmentUri] = useState("");
  const [enrollmentRecoveryCodes, setEnrollmentRecoveryCodes] = useState<string[]>([]);
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [enrollmentCodesCopied, setEnrollmentCodesCopied] = useState(false);

  useEffect(() => {
    // A successful OIDC/SAML login for an already-enrolled user redirects
    // here with a one-time mfaToken instead of completing the session
    // directly, so the TOTP challenge can be completed the same way a local
    // login's challenge is.
    const redirectedMfaToken = searchParams.get("mfaToken");
    if (redirectedMfaToken) {
      setMfaToken(redirectedMfaToken);
      setShowMfaPrompt(true);
      setTimeout(() => mfaInputRef.current?.focus(), 100);
      // Drop it from the URL: it's a one-time credential and has no business
      // sitting in browser history or a Referer header for the rest of the
      // challenge. Also stops a later effect re-run (e.g. a locale switch)
      // from reopening the prompt after the user has moved past it.
      setSearchParams({}, { replace: true });
      return;
    }

    const authError = searchParams.get("error");
    if (authError) {
      const errorMessages: Record<string, string> = {
        oidc_auth_failed: t.auth.oidcAuthFailed,
        oidc_provider_unreachable: t.auth.oidcProviderUnreachable,
        oidc_session_expired: t.auth.oidcSessionExpired,
        oidc_user_not_authorized: t.auth.oidcUserNotAuthorized,
        oidc_user_limit_reached: t.auth.oidcUserLimitReached,
        saml_auth_failed: t.auth.samlAuthFailed,
        saml_user_not_authorized: t.auth.samlUserNotAuthorized,
        saml_user_limit_reached: t.auth.samlUserLimitReached,
        mfa_enrollment_required: t.auth.mfaEnrollmentRequired,
        mfa_policy_unavailable: t.auth.mfaPolicyUnavailable,
      };
      setError(errorMessages[authError] || t.auth.oidcGenericError);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, t]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const failure = await res.json().catch(() => null);
        if (failure?.code === "MFA_ENROLLMENT_REQUIRED") {
          setError(t.auth.mfaEnrollmentRequired);
        } else if (failure?.code === "MFA_POLICY_UNAVAILABLE") {
          setError(t.auth.mfaPolicyUnavailable);
        } else if (res.status >= 500) {
          // A 5xx (a proxy answering with HTML mid-restart, a handler crash)
          // is not a credentials problem; claiming "invalid credentials"
          // invites password resets during an outage.
          setError(t.auth.connectionError);
        } else {
          setError(t.auth.invalidCredentials);
        }
        return;
      }
      const data = await res.json();
      if (data.requiresMfaEnrollment) {
        // A licensed instance with a required MFA policy walks an unenrolled
        // user through TOTP setup at login instead of blocking them. The
        // secret is fresh per response, so once the panel is up we keep the
        // token and URI in state and never re-submit the form underneath the
        // user (that would rotate the secret out from under a scanned QR).
        setEnrollmentToken(data.enrollmentToken);
        setEnrollmentUri(data.uri);
        setEnrollmentRecoveryCodes(data.recoveryCodes ?? []);
        setShowMfaEnrollment(true);
        setTimeout(() => mfaInputRef.current?.focus(), 100);
        return;
      }
      if (data.requiresMfa) {
        setMfaToken(data.mfaToken);
        setShowMfaPrompt(true);
        setTimeout(() => mfaInputRef.current?.focus(), 100);
        return;
      }
      setToken(data.token);
      localStorage.setItem("snapotter-username", data.user?.username || username);
      if (data.user?.mustChangePassword) {
        window.location.href = "/change-password";
      } else {
        window.location.href = "/";
      }
    } catch {
      setError(t.auth.connectionError);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaComplete = async () => {
    setMfaLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/mfa/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaToken, code: mfaCode }),
      });
      if (!res.ok) {
        setError(t.auth.mfaInvalidCode);
        setMfaCode("");
        return;
      }
      const data = await res.json();
      setToken(data.token);
      localStorage.setItem("snapotter-username", data.user?.username || username);
      if (data.user?.mustChangePassword) {
        window.location.href = "/change-password";
      } else {
        window.location.href = "/";
      }
    } catch {
      setError(t.auth.connectionError);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleEnrollComplete = async () => {
    setEnrollmentLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/mfa/enroll-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentToken, code: enrollmentCode }),
      });
      if (!res.ok) {
        setError(t.auth.mfaInvalidCode);
        setEnrollmentCode("");
        return;
      }
      const data = await res.json();
      setToken(data.token);
      localStorage.setItem("snapotter-username", data.user?.username || username);
      if (data.user?.mustChangePassword) {
        window.location.href = "/change-password";
      } else {
        window.location.href = "/";
      }
    } catch {
      setError(t.auth.connectionError);
    } finally {
      setEnrollmentLoading(false);
    }
  };

  const handleCopyRecoveryCodes = async () => {
    if (enrollmentRecoveryCodes.length === 0) return;
    const ok = await copyToClipboard(enrollmentRecoveryCodes.join("\n"));
    if (ok) {
      setEnrollmentCodesCopied(true);
      setTimeout(() => setEnrollmentCodesCopied(false), 2000);
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex h-dvh bg-background">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              <span className="text-primary-ink">SnapOtter</span>
            </h1>
            <h2 className="text-2xl font-bold mt-4 text-foreground">{t.auth.login}</h2>
          </div>
          {ssoEnforced && (oidcEnabled || samlEnabled) && (
            <div className="space-y-3">
              {oidcEnabled && (
                <a
                  href="/api/auth/oidc/login"
                  className="w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium shadow-sm hover:bg-primary-light transition-colors flex items-center justify-center gap-2.5"
                >
                  <KeyRound className="w-[18px] h-[18px]" aria-hidden="true" />
                  {format(t.auth.signInWith, { provider: oidcProviderName || "SSO" })}
                </a>
              )}
              {samlEnabled && (
                <a
                  href="/api/auth/saml/login"
                  className="w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium shadow-sm hover:bg-primary-light transition-colors flex items-center justify-center gap-2.5"
                >
                  <KeyRound className="w-[18px] h-[18px]" aria-hidden="true" />
                  {format(t.auth.signInWith, { provider: samlProviderName || "SSO" })}
                </a>
              )}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 border-t border-border" />
                <span className="text-sm text-muted-foreground">{t.auth.or}</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {t.auth.ssoEnforcedLocalRestricted}
              </p>
            </div>
          )}
          {showMfaEnrollment ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                    role="img"
                    aria-hidden="true"
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t.auth.mfaEnrollmentHeading}
                  </p>
                </div>
              </div>
              <p className="text-sm text-foreground">{t.settings.security.twoFactorScanQr}</p>
              {enrollmentUri && <QrCode uri={enrollmentUri} />}
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t.settings.security.twoFactorManualEntry}
                </p>
                <code className="block text-xs bg-muted rounded-md px-3 py-2 break-all">
                  {parseManualSecret(enrollmentUri)}
                </code>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t.settings.security.twoFactorRecoveryCodesHeading}
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  {t.settings.security.twoFactorRecoveryCodesDescription}
                </p>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-3 font-mono text-xs">
                  {enrollmentRecoveryCodes.map((rc) => (
                    <span key={rc}>{rc}</span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCopyRecoveryCodes}
                  className="mt-2 text-xs text-primary-ink hover:underline"
                >
                  {enrollmentCodesCopied
                    ? t.settings.security.twoFactorCodesCopied
                    : t.settings.security.twoFactorCopyRecoveryCodes}
                </button>
              </div>
              <div>
                <label
                  htmlFor="enrollment-code"
                  className="block text-sm font-medium mb-1 text-foreground"
                >
                  {t.settings.security.twoFactorEnterCode}
                </label>
                <input
                  id="enrollment-code"
                  ref={mfaInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder={t.settings.security.twoFactorCodePlaceholder}
                  value={enrollmentCode}
                  onChange={(e) => setEnrollmentCode(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && enrollmentCode.length >= 6) handleEnrollComplete();
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="button"
                onClick={handleEnrollComplete}
                disabled={enrollmentLoading || enrollmentCode.length < 6}
                className="w-full py-3 rounded-lg bg-primary/80 text-primary-foreground font-medium hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enrollmentLoading ? t.auth.verifying : t.settings.security.twoFactorConfirmButton}
              </button>
            </div>
          ) : showMfaPrompt ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                    role="img"
                    aria-hidden="true"
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t.auth.mfaRequired}</p>
                </div>
              </div>
              <input
                ref={mfaInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                autoComplete="one-time-code"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && mfaCode.length >= 6) handleMfaComplete();
                }}
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="button"
                onClick={handleMfaComplete}
                disabled={mfaLoading || mfaCode.length < 6}
                className="w-full py-3 rounded-lg bg-primary/80 text-primary-foreground font-medium hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mfaLoading ? t.auth.verifying : t.auth.verify}
              </button>
              <p className="text-xs text-muted-foreground text-center">{t.auth.mfaRecoveryHint}</p>
              <button
                type="button"
                onClick={() => {
                  setShowMfaPrompt(false);
                  setMfaToken("");
                  setMfaCode("");
                  setError("");
                }}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.common.back}
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className={`space-y-4${ssoEnforced ? " opacity-60" : ""}`}
            >
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium mb-1 text-foreground"
                >
                  {t.auth.username}
                </label>
                <input
                  id="username"
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t.auth.enterUsername}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium mb-1 text-foreground"
                >
                  {t.auth.password}
                </label>
                <input
                  id="password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.auth.enterPassword}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full py-3 rounded-lg bg-primary/80 text-primary-foreground font-medium hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t.auth.loggingIn : t.auth.loginButton}
              </button>
            </form>
          )}
          {!ssoEnforced && (oidcEnabled || samlEnabled) && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 border-t border-border" />
                <span className="text-sm text-muted-foreground">{t.auth.or}</span>
                <div className="flex-1 border-t border-border" />
              </div>
              {oidcEnabled && (
                <a
                  href="/api/auth/oidc/login"
                  className="group w-full py-3 px-4 rounded-lg border border-border bg-card text-foreground font-medium shadow-sm hover:border-primary hover:bg-primary-subtle transition-colors flex items-center justify-center gap-2.5"
                >
                  <KeyRound
                    className="w-[18px] h-[18px] text-muted-foreground group-hover:text-primary-ink transition-colors"
                    aria-hidden="true"
                  />
                  {format(t.auth.signInWith, { provider: oidcProviderName || "SSO" })}
                </a>
              )}
              {samlEnabled && (
                <a
                  href="/api/auth/saml/login"
                  className="group w-full mt-2 py-3 px-4 rounded-lg border border-border bg-card text-foreground font-medium shadow-sm hover:border-primary hover:bg-primary-subtle transition-colors flex items-center justify-center gap-2.5"
                >
                  <KeyRound
                    className="w-[18px] h-[18px] text-muted-foreground group-hover:text-primary-ink transition-colors"
                    aria-hidden="true"
                  />
                  {format(t.auth.signInWith, { provider: samlProviderName || "SSO" })}
                </a>
              )}
            </>
          )}
          <div className="pt-2">
            <LanguageSelector />
          </div>
        </div>
      </div>
      <div className="hidden lg:flex flex-1 bg-primary/90 items-center justify-center p-12 text-primary-foreground rounded-s-3xl">
        <div className="max-w-lg space-y-4 text-center">
          <h2 className="text-4xl font-extrabold tracking-tight">{t.auth.heroTitle}</h2>
          <p className="text-lg text-primary-foreground">{t.auth.heroSubtitle}</p>
          <p className="text-xl font-medium h-8">
            <RotatingPhrase />
          </p>
        </div>
      </div>
    </main>
  );
}
