import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { setToken } from "@/lib/api";
import { format } from "@/lib/format";

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
      className="inline-block transition-all duration-300 text-white/90"
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
  const { oidcEnabled, oidcProviderName } = useAuth();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const oidcError = searchParams.get("error");
    if (oidcError) {
      const errorMessages: Record<string, string> = {
        oidc_auth_failed: t.auth.oidcAuthFailed,
        oidc_provider_unreachable: t.auth.oidcProviderUnreachable,
        oidc_session_expired: t.auth.oidcSessionExpired,
        oidc_user_not_authorized: t.auth.oidcUserNotAuthorized,
        oidc_user_limit_reached: t.auth.oidcUserLimitReached,
      };
      setError(errorMessages[oidcError] || t.auth.oidcGenericError);
    }
  }, [searchParams, t]);

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
        const data = await res.json().catch(() => ({}));
        setError(t.auth.invalidCredentials);
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
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              <span className="text-primary">SnapOtter</span>
            </h1>
            <h2 className="text-2xl font-bold mt-4 text-foreground">{t.auth.login}</h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-1 text-foreground">
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
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1 text-foreground">
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
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          {oidcEnabled && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 border-t border-border" />
                <span className="text-sm text-muted-foreground">{t.auth.or}</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <a
                href="/api/auth/oidc/login"
                className="w-full py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
              >
                {format(t.auth.signInWith, { provider: oidcProviderName || "SSO" })}
              </a>
            </>
          )}
          <div className="pt-2">
            <LanguageSelector />
          </div>
        </div>
      </div>
      <div className="hidden lg:flex flex-1 bg-primary/90 items-center justify-center p-12 text-white rounded-s-3xl">
        <div className="max-w-lg space-y-4 text-center">
          <h2 className="text-4xl font-extrabold tracking-tight">{t.auth.heroTitle}</h2>
          <p className="text-lg text-white/70">{t.auth.heroSubtitle}</p>
          <p className="text-xl font-medium h-8">
            <RotatingPhrase />
          </p>
        </div>
      </div>
    </div>
  );
}
