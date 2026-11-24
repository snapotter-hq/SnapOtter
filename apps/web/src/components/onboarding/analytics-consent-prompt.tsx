import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { apiPut } from "@/lib/api";
import { AUTH_GUARD_UNGATED_PATHS } from "@/lib/auth-routes";
import { withTimeout } from "@/lib/with-timeout";
import { useAnalyticsStore } from "@/stores/analytics-store";

const WRITE_TIMEOUT_MS = 15_000;
const TELEMETRY_DOCS_URL = "https://docs.snapotter.com/guide/telemetry";

// Closing the prompt without answering hides it for this tab only. The
// instance stays undecided, which sends nothing, and the next visit asks again.
export const CONSENT_DISMISSED_SESSION_KEY = "snapotter-analytics-consent-dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_DISMISSED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First-run choice for a fresh install (#4910): send anonymous usage stats and
 * crash reports, or don't. Until an admin answers, the server reports
 * `consentPending` and nothing is sent from either side. Only an admin can
 * answer, because the answer is the instance-wide setting; with
 * AUTH_ENABLED=false the local user is the admin, so they see it too.
 */
export function AnalyticsConsentPrompt() {
  const { t } = useTranslation();
  const { role, mustChangePassword } = useAuth();
  const location = useLocation();
  const config = useAnalyticsStore((s) => s.config);
  const configLoaded = useAnalyticsStore((s) => s.configLoaded);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [answered, setAnswered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const visible =
    configLoaded &&
    config?.consentPending === true &&
    role === "admin" &&
    !mustChangePassword &&
    !AUTH_GUARD_UNGATED_PATHS.has(location.pathname) &&
    !dismissed &&
    !answered;

  function dismiss() {
    try {
      sessionStorage.setItem(CONSENT_DISMISSED_SESSION_KEY, "1");
    } catch {
      // Storage blocked: the prompt still closes for this page load.
    }
    setDismissed(true);
  }

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) dismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  async function answer(send: boolean) {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      await withTimeout(
        apiPut("/v1/settings", { analyticsEnabled: send ? "true" : "false" }),
        WRITE_TIMEOUT_MS,
      );
      // Saved, so close now: the refetch below keeps the old config on a
      // failed read, and the prompt must not sit there looking unanswered.
      setAnswered(true);
      // On "send" the refreshed config carries the keys App.tsx uses to start telemetry.
      await useAnalyticsStore.getState().fetchConfig();
    } catch (err) {
      console.warn("Saving the analytics choice failed", err);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-body"
      className="fixed bottom-4 end-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg space-y-4"
    >
      <div className="flex items-start gap-3">
        {/* An h2: RouteAnnouncer focuses the page's h1 on every navigation. */}
        <h2 id="analytics-consent-title" className="grow text-sm font-semibold text-foreground">
          {t.onboarding.analyticsConsentTitle}
        </h2>
        <button
          type="button"
          onClick={dismiss}
          disabled={saving}
          aria-label={t.common.close}
          className="-me-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <p id="analytics-consent-body" className="text-sm text-muted-foreground">
        {t.onboarding.analyticsConsentBody}{" "}
        <a
          href={TELEMETRY_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-ink underline underline-offset-2 hover:text-foreground"
        >
          {t.onboarding.analyticsConsentLearnMore}
        </a>
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t.onboarding.analyticsConsentSaveFailed}
        </p>
      )}
      {/* Equal weight on purpose: same style and width, and neither is focused or pre-selected. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => answer(true)}
          disabled={saving}
          className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {t.onboarding.analyticsConsentYes}
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={saving}
          className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {t.onboarding.analyticsConsentNo}
        </button>
      </div>
    </div>
  );
}
