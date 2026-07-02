// Single source of truth for the feedback_submitted event's enum fields.
// Consumed by: the API's Zod validation (apps/api/src/routes/feedback.ts),
// the API's PostHog event shape (apps/api/src/lib/analytics.ts), and the
// web app's feedback types (apps/web/src/lib/feedback.ts). Add new values
// here, not in any of those three. They all derive from this file.

export const FEEDBACK_SOURCE_VALUES = [
  "global",
  "tool_result",
  "failed_job",
  "admin_installer",
  "search_miss",
  "onboarding",
] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCE_VALUES)[number];

export const FEEDBACK_SURVEY_ID_VALUES = [
  "global-feedback-v1",
  "tool-result-v1",
  "failed-job-v1",
  "admin-install-v1",
  "search-miss-v1",
  "onboarding-usage-v1",
] as const;
export type FeedbackSurveyId = (typeof FEEDBACK_SURVEY_ID_VALUES)[number];

export const FEEDBACK_SENTIMENT_VALUES = [
  "great",
  "okay",
  "issue",
  "missing",
  "bug",
  "idea",
  "other",
] as const;
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENT_VALUES)[number];

export const FEEDBACK_TYPE_VALUES = [
  "bug",
  "feature_request",
  "confusing_ux",
  "performance",
  "other",
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPE_VALUES)[number];

export const FEEDBACK_INSTALL_METHOD_VALUES = [
  "docker",
  "docker_compose",
  "source",
  "cloud",
  "other",
] as const;
export type FeedbackInstallMethod = (typeof FEEDBACK_INSTALL_METHOD_VALUES)[number];

export const FEEDBACK_USAGE_TYPE_VALUES = [
  "personal",
  "team_internal",
  "business_workflow",
  "education",
  "evaluating",
] as const;
export type FeedbackUsageType = (typeof FEEDBACK_USAGE_TYPE_VALUES)[number];

export const FEEDBACK_IMPORTANT_AREA_VALUES = [
  "images",
  "pdf_docs",
  "video_audio",
  "batch_workflows",
  "ai_tools",
] as const;
export type FeedbackImportantArea = (typeof FEEDBACK_IMPORTANT_AREA_VALUES)[number];

export const FEEDBACK_FRICTION_AREA_VALUES = [
  "smooth",
  "docker",
  "environment_variables",
  "auth",
  "storage",
  "workers",
  "ai_tools",
  "docs",
  "performance",
  "other",
] as const;
export type FeedbackFrictionArea = (typeof FEEDBACK_FRICTION_AREA_VALUES)[number];

export const FEEDBACK_ERROR_CATEGORY_VALUES = [
  "validation_error",
  "upload_error",
  "processing_error",
  "timeout",
  "unsupported_format",
  "worker_unavailable",
  "unknown",
] as const;
export type FeedbackErrorCategory = (typeof FEEDBACK_ERROR_CATEGORY_VALUES)[number];
