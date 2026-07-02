import {
  Building2,
  FileText,
  GraduationCap,
  Image,
  Layers,
  Search,
  Sparkles,
  User,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { apiGet, apiPut } from "@/lib/api";
import { AUTH_GUARD_UNGATED_PATHS } from "@/lib/auth-routes";
import {
  type FeedbackImportantArea,
  type FeedbackUsageType,
  promptVariantForSource,
  shouldShowUsageSurvey,
  submitFeedback,
  surveyIdForSource,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useAnalyticsStore } from "@/stores/analytics-store";

const USAGE_TYPES: { value: FeedbackUsageType; Icon: typeof User; wide?: boolean }[] = [
  { value: "personal", Icon: User },
  { value: "team_internal", Icon: Users },
  { value: "business_workflow", Icon: Building2 },
  { value: "education", Icon: GraduationCap },
  { value: "evaluating", Icon: Search, wide: true },
];

const IMPORTANT_AREAS: { value: FeedbackImportantArea; Icon: typeof Image; wide?: boolean }[] = [
  { value: "images", Icon: Image },
  { value: "pdf_docs", Icon: FileText },
  { value: "video_audio", Icon: Video },
  { value: "batch_workflows", Icon: Layers },
  { value: "ai_tools", Icon: Sparkles, wide: true },
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
  const [importantAreas, setImportantAreas] = useState<FeedbackImportantArea[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const busy = submitting || dismissing;
  const submittedAnswerKeyRef = useRef<string | null>(null);

  const eligibleAuthState = role === "admin" && !mustChangePassword;
  const eligibleRoute = !AUTH_GUARD_UNGATED_PATHS.has(location.pathname);

  useEffect(() => {
    if (!eligibleAuthState || !eligibleRoute) return;
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => setSettings({}));
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

  useFocusTrap(containerRef, visible);

  function toggleArea(area: FeedbackImportantArea) {
    setImportantAreas((current) =>
      current.includes(area) ? current.filter((value) => value !== area) : [...current, area],
    );
  }

  async function recordSettingsKey(key: string) {
    const value = new Date().toISOString();
    await apiPut("/v1/settings", { [key]: value });
    setSettings((current) => ({ ...(current ?? {}), [key]: value }));
  }

  async function handleContinue() {
    if (!usageType || busy) return;
    setSubmitting(true);
    const answerKey = JSON.stringify({ usageType, importantAreas: [...importantAreas].sort() });
    try {
      if (submittedAnswerKeyRef.current !== answerKey) {
        await submitFeedback({
          source: "onboarding",
          surveyId: surveyIdForSource("onboarding"),
          promptVariant: promptVariantForSource("onboarding"),
          usageType,
          importantAreas,
        });
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

  async function handleDismiss() {
    if (busy) return;
    setDismissing(true);
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
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-survey-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4"
    >
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div
            aria-hidden="true"
            className="h-11 w-11 rounded-full bg-primary flex items-center justify-center text-xl"
          >
            🦦
          </div>
          <h1 id="usage-survey-title" className="text-lg font-semibold text-foreground">
            {t.onboarding.usageSurveyTitle}
          </h1>
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
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-foreground hover:bg-muted",
                wide && "col-span-2 justify-center",
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {t.feedback.usageTypes[value]}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p id="usage-survey-tools-label" className="text-sm font-medium text-foreground">
            {t.onboarding.usageSurveyToolsLabel}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {t.onboarding.pickAnyHint}
            </span>
          </p>
          {/* biome-ignore lint/a11y/useSemanticElements: plain group wrapper for toggle buttons, a fieldset would disrupt the grid layout */}
          <div
            role="group"
            aria-labelledby="usage-survey-tools-label"
            className="grid grid-cols-2 gap-2"
          >
            {IMPORTANT_AREAS.map(({ value, Icon, wide }) => (
              <button
                key={value}
                type="button"
                aria-pressed={importantAreas.includes(value)}
                onClick={() => toggleArea(value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-start transition-colors",
                  importantAreas.includes(value)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:bg-muted",
                  wide && "col-span-2 justify-center",
                )}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {t.feedback.importantAreas[value]}
              </button>
            ))}
          </div>
        </div>

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
            onClick={handleDismiss}
            disabled={busy}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {t.feedback.dontAskAgain}
          </button>
        </div>
      </div>
    </div>
  );
}
