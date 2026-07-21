import type {
  FeedbackDiscoverySource,
  FeedbackErrorCategory,
  FeedbackFrictionArea,
  FeedbackImportantArea,
  FeedbackInstallMethod,
  FeedbackPriorTool,
  FeedbackSelfHostMotivation,
  FeedbackSentiment,
  FeedbackSource,
  FeedbackSurveyId,
  FeedbackType,
  FeedbackUsageType,
} from "@snapotter/shared";
import { ANALYTICS_EVENTS, ONBOARDING_FIRST_PROCESSED_KEY } from "@snapotter/shared";
import { track } from "@/lib/analytics";
import { apiPost } from "@/lib/api";

export type {
  FeedbackDiscoverySource,
  FeedbackErrorCategory,
  FeedbackFrictionArea,
  FeedbackImportantArea,
  FeedbackInstallMethod,
  FeedbackPriorTool,
  FeedbackSelfHostMotivation,
  FeedbackSentiment,
  FeedbackSource,
  FeedbackSurveyId,
  FeedbackType,
  FeedbackUsageType,
};

export type FeedbackPromptVariant =
  | "nav-v1"
  | "inline-v1"
  | "failed-button-v1"
  | "settings-card-v1"
  | "search-empty-v1"
  | "search-results-v1"
  | "onboarding-overlay-v1";

export interface FeedbackPayload {
  source: FeedbackSource;
  surveyId?: FeedbackSurveyId;
  promptVariant?: FeedbackPromptVariant;
  sentiment?: FeedbackSentiment;
  feedbackType?: FeedbackType;
  message?: string;
  contactOk?: boolean;
  contactEmail?: string;
  contactName?: string;
  company?: string;
  toolId?: string;
  searchQuery?: string;
  jobStatus?: "completed" | "failed";
  installMethod?: FeedbackInstallMethod;
  usageType?: FeedbackUsageType;
  importantAreas?: FeedbackImportantArea[];
  frictionArea?: FeedbackFrictionArea;
  priorTool?: FeedbackPriorTool;
  selfHostMotivation?: FeedbackSelfHostMotivation;
  discoverySource?: FeedbackDiscoverySource;
  errorCategory?: FeedbackErrorCategory;
}

export interface FeedbackResponse {
  ok: boolean;
  accepted: boolean;
}

interface InstallFeedbackVisibilityOptions {
  settings: Record<string, string>;
  role: string | null;
  analyticsConfigLoaded: boolean;
  analyticsEnabled: boolean;
  now?: number;
}

export function surveyIdForSource(source: FeedbackSource): FeedbackSurveyId {
  switch (source) {
    case "tool_result":
      return "tool-result-v1";
    case "failed_job":
      return "failed-job-v1";
    case "admin_installer":
      return "admin-install-v1";
    case "search_miss":
      return "search-miss-v1";
    case "global":
      return "global-feedback-v1";
    case "onboarding":
      return "onboarding-usage-v1";
  }
}

export function promptVariantForSource(source: FeedbackSource): FeedbackPromptVariant {
  switch (source) {
    case "tool_result":
      return "inline-v1";
    case "failed_job":
      return "failed-button-v1";
    case "admin_installer":
      return "settings-card-v1";
    case "search_miss":
      return "search-empty-v1";
    case "global":
      return "nav-v1";
    case "onboarding":
      return "onboarding-overlay-v1";
  }
}

/** How a feedback prompt was dismissed, for the feedback_prompt_dismissed event. */
export type FeedbackDismissKind = "close" | "dont_ask_again" | "snooze";

/**
 * Fire when a feedback surface becomes visible. Paired with
 * trackFeedbackPromptDismissed and the server-side submit event, this gives skip
 * and completion rates a denominator instead of counting only submissions.
 */
export function trackFeedbackPromptShown(source: FeedbackSource): void {
  track(ANALYTICS_EVENTS.FEEDBACK_PROMPT_SHOWN, {
    source,
    survey_id: surveyIdForSource(source),
    prompt_variant: promptVariantForSource(source),
  });
}

/** Fire when a feedback surface is dismissed without submitting. */
export function trackFeedbackPromptDismissed(
  source: FeedbackSource,
  dismissKind: FeedbackDismissKind,
): void {
  track(ANALYTICS_EVENTS.FEEDBACK_PROMPT_DISMISSED, {
    source,
    survey_id: surveyIdForSource(source),
    prompt_variant: promptVariantForSource(source),
    dismiss_kind: dismissKind,
  });
}

export function classifyFeedbackError(message: string | null | undefined): FeedbackErrorCategory {
  const value = (message ?? "").toLowerCase();
  if (!value) return "unknown";
  if (value.includes("timed out") || value.includes("timeout")) return "timeout";
  if (value.includes("upload") || value.includes("interrupted")) return "upload_error";
  if (value.includes("validation") || value.includes("invalid") || value.includes("required")) {
    return "validation_error";
  }
  if (value.includes("unsupported")) return "unsupported_format";
  if (value.includes("worker") || value.includes("queue")) return "worker_unavailable";
  return "processing_error";
}

export function shouldShowInstallFeedbackCard({
  settings,
  role,
  analyticsConfigLoaded,
  analyticsEnabled,
  now = Date.now(),
}: InstallFeedbackVisibilityOptions): boolean {
  if (!analyticsConfigLoaded || !analyticsEnabled || role !== "admin") return false;
  if (settings["feedback.install.submittedAt"] || settings["feedback.install.dismissedAt"]) {
    return false;
  }

  const snoozedUntil = settings["feedback.install.snoozedUntil"];
  if (!snoozedUntil) return true;

  const parsedSnooze = Date.parse(snoozedUntil);
  return !Number.isFinite(parsedSnooze) || parsedSnooze <= now;
}

interface UsageSurveyVisibilityOptions {
  settings: Record<string, string>;
  role: string | null;
  analyticsConfigLoaded: boolean;
  analyticsEnabled: boolean;
}

export function shouldShowUsageSurvey({
  settings,
  role,
  analyticsConfigLoaded,
  analyticsEnabled,
}: UsageSurveyVisibilityOptions): boolean {
  if (!analyticsConfigLoaded || !analyticsEnabled || role !== "admin") return false;
  // Hold the survey until the instance has completed its first processing (the
  // worker writes this marker on the first successful job). Asking on an empty
  // first-landing app yields answers from users who haven't used the product;
  // waiting for one real result reaches an engaged admin instead.
  if (!settings[ONBOARDING_FIRST_PROCESSED_KEY]) return false;
  return (
    !settings["onboarding.usageSurvey.answeredAt"] &&
    !settings["onboarding.usageSurvey.dismissedAt"]
  );
}

export interface MigrationMarker {
  status: "completed" | "detected_locked";
  tables?: Record<string, number>;
  blobs?: { present: number; missing: number };
}

/** Parse the `sqlite_import` settings marker written by the 1.x import on boot. */
export function parseMigrationMarker(raw: string | undefined): MigrationMarker | null {
  if (!raw) return null;
  try {
    const marker = JSON.parse(raw) as MigrationMarker;
    return marker.status === "completed" || marker.status === "detected_locked" ? marker : null;
  } catch {
    return null;
  }
}

/**
 * Show the 1.x migration banner to admins when an import marker exists and has
 * not been dismissed. The marker key is admin-only (SENSITIVE_KEYS on the API),
 * so non-admins never receive it, and we gate on role here as well.
 */
export function shouldShowMigrationBanner({
  settings,
  role,
}: {
  settings: Record<string, string>;
  role: string | null;
}): boolean {
  if (role !== "admin") return false;
  if (settings["sqlite_import.dismissedAt"]) return false;
  return parseMigrationMarker(settings.sqlite_import) !== null;
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  return apiPost<FeedbackResponse>("/v1/feedback", payload);
}

const FEEDBACK_ISSUE_NEW_URL = "https://github.com/snapotter-hq/snapotter/issues/new";
const MAX_FEEDBACK_LEN = 2000;

export const SNAPOTTER_FEEDBACK_EMAIL = "contact@snapotter.com";

/** Normalize newlines, trim, and clamp so the message is safe to put in a URL. */
function sanitizeFeedbackMessage(message: string): string {
  return message.replace(/\r\n/g, "\n").trim().slice(0, MAX_FEEDBACK_LEN);
}

/**
 * Prefilled GitHub issue URL for general feedback. Blank issues are disabled on
 * the repo, so we must target a template by file name; `details` matches the
 * `id` of the textarea in `.github/ISSUE_TEMPLATE/feedback.yml`.
 */
export function buildFeedbackGithubUrl(message: string): string {
  const params = new URLSearchParams({
    template: "feedback.yml",
    details: sanitizeFeedbackMessage(message),
  });
  return `${FEEDBACK_ISSUE_NEW_URL}?${params.toString()}`;
}

/** Prefilled mailto to the project address, for users who prefer a private channel. */
export function buildFeedbackMailtoUrl(message: string): string {
  const subject = encodeURIComponent("SnapOtter feedback");
  const body = encodeURIComponent(sanitizeFeedbackMessage(message));
  return `mailto:${SNAPOTTER_FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}
