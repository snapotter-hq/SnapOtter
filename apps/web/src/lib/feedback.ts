import { apiPost } from "@/lib/api";

export type FeedbackSource =
  | "global"
  | "tool_result"
  | "failed_job"
  | "admin_installer"
  | "search_miss"
  | "onboarding";
export type FeedbackSurveyId =
  | "global-feedback-v1"
  | "tool-result-v1"
  | "failed-job-v1"
  | "admin-install-v1"
  | "search-miss-v1"
  | "onboarding-usage-v1";
export type FeedbackPromptVariant =
  | "nav-v1"
  | "inline-v1"
  | "failed-button-v1"
  | "settings-card-v1"
  | "search-empty-v1"
  | "search-results-v1"
  | "onboarding-overlay-v1";
export type FeedbackSentiment = "great" | "okay" | "issue" | "missing" | "bug" | "idea" | "other";
export type FeedbackType = "bug" | "feature_request" | "confusing_ux" | "performance" | "other";
export type FeedbackInstallMethod = "docker" | "docker_compose" | "source" | "cloud" | "other";
export type FeedbackUsageType =
  | "personal"
  | "team_internal"
  | "business_workflow"
  | "education"
  | "evaluating";
export type FeedbackImportantArea =
  | "images"
  | "pdf_docs"
  | "video_audio"
  | "batch_workflows"
  | "ai_tools";
export type FeedbackFrictionArea =
  | "smooth"
  | "docker"
  | "environment_variables"
  | "auth"
  | "storage"
  | "workers"
  | "ai_tools"
  | "docs"
  | "performance"
  | "other";
export type FeedbackErrorCategory =
  | "validation_error"
  | "upload_error"
  | "processing_error"
  | "timeout"
  | "unsupported_format"
  | "worker_unavailable"
  | "unknown";

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
  return (
    !settings["onboarding.usageSurvey.answeredAt"] &&
    !settings["onboarding.usageSurvey.dismissedAt"]
  );
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  return apiPost<FeedbackResponse>("/v1/feedback", payload);
}
