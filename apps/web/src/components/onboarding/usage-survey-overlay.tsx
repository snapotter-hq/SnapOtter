import {
  FEEDBACK_DISCOVERY_SOURCE_VALUES,
  FEEDBACK_PRIOR_TOOL_VALUES,
  FEEDBACK_SELFHOST_MOTIVATION_VALUES,
} from "@snapotter/shared";
import { Building2, GraduationCap, Search, User, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiPut } from "@/lib/api";
import { AUTH_GUARD_UNGATED_PATHS } from "@/lib/auth-routes";
import {
  type FeedbackDiscoverySource,
  type FeedbackDismissKind,
  type FeedbackPriorTool,
  type FeedbackSelfHostMotivation,
  type FeedbackUsageType,
  promptVariantForSource,
  shouldShowUsageSurvey,
  submitFeedback,
  surveyIdForSource,
  trackFeedbackPromptDismissed,
  trackFeedbackPromptShown,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { withTimeout } from "@/lib/with-timeout";
import { useAnalyticsStore } from "@/stores/analytics-store";

// A hung write (connection black-holed, never erroring) would otherwise leave both
// buttons disabled forever with no exit but a page reload; time it out so the overlay
// re-enables and the admin can retry or dismiss.
const WRITE_TIMEOUT_MS = 15_000;

const USAGE_TYPES: { value: FeedbackUsageType; Icon: typeof User; wide?: boolean }[] = [
  { value: "personal", Icon: User },
  { value: "team_internal", Icon: Users },
  { value: "business_workflow", Icon: Building2 },
  { value: "education", Icon: GraduationCap },
  { value: "evaluating", Icon: Search, wide: true },
];

export function UsageSurveyOverlay() {
  const { t } = useTranslation();
  const { role, mustChangePassword } = useAuth();
  const location = useLocation();
  const analyticsConfig = useAnalyticsStore((s) => s.config);
  const analyticsConfigLoaded = useAnalyticsStore((s) => s.configLoaded);
  const containerRef = useRef<HTMLDivElement>(null);

  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [usageType, setUsageType] = useState<FeedbackUsageType | null>(null);
  // The survey asks only what telemetry cannot infer. Modality preference is
  // already visible in tool_used, and install method in instance_started, so
  // instead we ask what they came from, why they self-host, and how they found
  // us. Prior tool and motivation are optional; discovery source is optional too.
  const [priorTool, setPriorTool] = useState<FeedbackPriorTool | null>(null);
  const [selfHostMotivation, setSelfHostMotivation] = useState<FeedbackSelfHostMotivation | null>(
    null,
  );
  const [discoverySource, setDiscoverySource] = useState<FeedbackDiscoverySource | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const busy = submitting || dismissing;
  const submittedAnswerKeyRef = useRef<string | null>(null);
  const shownTrackedRef = useRef(false);

  const eligibleAuthState = role === "admin" && !mustChangePassword;
  const eligibleRoute = !AUTH_GUARD_UNGATED_PATHS.has(location.pathname);

  useEffect(() => {
    if (!eligibleAuthState || !eligibleRoute) return;
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => {
        // Fail closed: without settings we cannot know whether the admin
        // already answered, and showing the full-screen overlay while the
        // API is unhealthy would soft-lock them (the dismiss/continue
        // writes would fail against the same unhealthy API). Skipping the
        // survey for this load is the cheap, recoverable outcome.
      });
  }, [eligibleAuthState, eligibleRoute]);

  const visible =
    eligibleAuthState &&
    eligibleRoute &&
    settings !== null &&
    shouldShowUsageSurvey({
      settings,
      role,
      analyticsConfigLoaded,
      analyticsEnabled: Boolean(analyticsConfig?.enabled),
    });

  // A non-modal prompt must not trap focus (that is what made the old overlay
  // inescapable), but it should still honour Escape, which the modal version
  // never did.
  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void handleDismiss("close");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // Record the impression once the overlay first becomes visible, so the survey's
  // completion and skip rates have a denominator (submissions alone can't measure
  // how many admins saw it and walked away).
  useEffect(() => {
    if (visible && !shownTrackedRef.current) {
      shownTrackedRef.current = true;
      trackFeedbackPromptShown("onboarding");
    }
  }, [visible]);

  async function recordSettingsKey(key: string) {
    const value = new Date().toISOString();
    await withTimeout(apiPut("/v1/settings", { [key]: value }), WRITE_TIMEOUT_MS);
    setSettings((current) => ({ ...(current ?? {}), [key]: value }));
  }

  async function handleContinue() {
    if (!usageType || busy) return;
    setSubmitting(true);
    const answerKey = JSON.stringify({ usageType, priorTool, selfHostMotivation, discoverySource });
    try {
      if (submittedAnswerKeyRef.current !== answerKey) {
        await withTimeout(
          submitFeedback({
            source: "onboarding",
            surveyId: surveyIdForSource("onboarding"),
            promptVariant: promptVariantForSource("onboarding"),
            usageType,
            ...(priorTool ? { priorTool } : {}),
            ...(selfHostMotivation ? { selfHostMotivation } : {}),
            ...(discoverySource ? { discoverySource } : {}),
          }),
          WRITE_TIMEOUT_MS,
        );
        submittedAnswerKeyRef.current = answerKey;
      }
      await recordSettingsKey("onboarding.usageSurvey.answeredAt");
    } catch {
      // Submission failed (network/auth). Leave the overlay visible so the
      // admin can retry instead of silently losing their answer. If this
      // exact answer already submitted successfully (submittedAnswerKeyRef
      // matches), a retry only retries the settings write, so the same
      // answer never gets submitted twice, but a genuinely different answer
      // always submits fresh.
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDismiss(kind: FeedbackDismissKind = "dont_ask_again") {
    if (busy) return;
    setDismissing(true);
    trackFeedbackPromptDismissed("onboarding", kind);
    try {
      await recordSettingsKey("onboarding.usageSurvey.dismissedAt");
    } catch {
      // Same reasoning as handleContinue's catch: a failed write just means
      // the overlay stays visible next time, an acceptable low-stakes
      // fallback.
    } finally {
      setDismissing(false);
    }
  }

  if (!visible) return null;

  return (
    // Deliberately NOT a modal. This used to be an opaque full-screen takeover
    // with a focus trap and no Escape, which meant the only ways out were to
    // answer or to find a tiny grey link. It is now a corner card: the app stays
    // visible and usable behind it, Escape closes it, and the only required
    // question is the first one.
    <div
      ref={containerRef}
      role="dialog"
      aria-labelledby="usage-survey-title"
      className="fixed bottom-4 end-4 z-50 w-[calc(100vw-2rem)] max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-lg space-y-4"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="h-8 w-8 shrink-0 rounded-full bg-primary flex items-center justify-center text-base"
          >
            🦦
          </div>
          {/*
            An h2, not an h1. RouteAnnouncer focuses and announces
            document.querySelector("h1") on every route change, so while this
            prompt claimed the page's h1 it stole focus on appear and made every
            subsequent navigation announce "How are you using SnapOtter?"
            instead of the page the user actually opened.
          */}
          <h2 id="usage-survey-title" className="grow text-sm font-semibold text-foreground">
            {t.onboarding.usageSurveyTitle}
          </h2>
          <button
            type="button"
            onClick={() => handleDismiss("close")}
            disabled={busy}
            aria-label={t.feedback.closeLabel}
            className="-me-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div
          role="radiogroup"
          aria-labelledby="usage-survey-title"
          className="grid grid-cols-2 gap-2"
        >
          {USAGE_TYPES.map(({ value, Icon, wide }) => (
            // biome-ignore lint/a11y/useSemanticElements: styled button with icon and label acting as an ARIA radio, not a native input
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={usageType === value}
              onClick={() => setUsageType(value)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-start transition-colors",
                usageType === value
                  ? "border-primary bg-primary/10 text-primary-ink"
                  : "border-border text-foreground hover:bg-muted",
                wide && "col-span-2 justify-center",
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {t.feedback.usageTypes[value]}
            </button>
          ))}
        </div>

        {/*
          Progressive disclosure. The optional questions stay out of the way
          until the one required answer is given, so the opening ask is a single
          click rather than a wall of 20 choices. Send is enabled the moment the
          first question is answered, so nobody is obliged to reach these.
        */}
        {usageType !== null && (
          <>
            <div className="space-y-2">
              <p id="usage-survey-prior-label" className="text-sm font-medium text-foreground">
                {t.onboarding.priorToolLabel}{" "}
                <span className="text-muted-foreground font-normal">
                  {t.onboarding.optionalHint}
                </span>
              </p>
              <div
                role="radiogroup"
                aria-labelledby="usage-survey-prior-label"
                className="grid grid-cols-1 gap-2"
              >
                {FEEDBACK_PRIOR_TOOL_VALUES.map((value) => (
                  // biome-ignore lint/a11y/useSemanticElements: styled button acting as an ARIA radio, not a native input
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={priorTool === value}
                    onClick={() => setPriorTool((current) => (current === value ? null : value))}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm font-medium text-start transition-colors",
                      priorTool === value
                        ? "border-primary bg-primary/10 text-primary-ink"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    {t.feedback.priorTools[value]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p id="usage-survey-motivation-label" className="text-sm font-medium text-foreground">
                {t.onboarding.selfHostMotivationLabel}
              </p>
              <div
                role="radiogroup"
                aria-labelledby="usage-survey-motivation-label"
                className="grid grid-cols-1 gap-2"
              >
                {FEEDBACK_SELFHOST_MOTIVATION_VALUES.map((value) => (
                  // biome-ignore lint/a11y/useSemanticElements: styled button acting as an ARIA radio, not a native input
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selfHostMotivation === value}
                    onClick={() =>
                      setSelfHostMotivation((current) => (current === value ? null : value))
                    }
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm font-medium text-start transition-colors",
                      selfHostMotivation === value
                        ? "border-primary bg-primary/10 text-primary-ink"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    {t.feedback.selfHostMotivations[value]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="usage-survey-discovery-source"
                className="block text-sm font-medium text-foreground"
              >
                {t.onboarding.discoverySourceLabel}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {t.onboarding.optionalHint}
                </span>
              </label>
              <select
                id="usage-survey-discovery-source"
                value={discoverySource ?? ""}
                onChange={(event) =>
                  setDiscoverySource((event.target.value || null) as FeedbackDiscoverySource | null)
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              >
                <option value="" />
                {FEEDBACK_DISCOVERY_SOURCE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t.feedback.discoverySources[value]}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!usageType || busy}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {t.onboarding.continueLabel}
          </button>
          <button
            type="button"
            // Wrapped, not passed by reference: a bare handler would hand the
            // click event in as the dismiss kind.
            onClick={() => handleDismiss("dont_ask_again")}
            disabled={busy}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
          >
            {t.feedback.dontAskAgain}
          </button>
        </div>
      </div>
    </div>
  );
}
