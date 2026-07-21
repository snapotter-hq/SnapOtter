export const ANALYTICS_EVENTS = {
  TOOL_USED: "tool_used",
  TOOL_OPENED: "tool_opened",
  FILE_ADDED: "file_added",
  TOOL_STARTED: "tool_started",
  TOOL_CLIENT_ERROR: "tool_client_error",
  RESULT_DOWNLOADED: "result_downloaded",
  RESULT_SAVED: "result_saved",
  SEARCH: "search",
  PIPELINE_EXECUTED: "pipeline_executed",
  AI_BUNDLE_ACTION: "ai_bundle_action",
  AI_BUNDLE_PROMPTED: "ai_bundle_prompted",
  BATCH_PROCESSED: "batch_processed",
  FEEDBACK_SUBMITTED: "feedback_submitted",
  // The onboarding usage survey (source: "onboarding") is a profiling survey,
  // not feedback. It rides the same /v1/feedback endpoint but is emitted under
  // its own event name so feedback_submitted stays genuine feedback only.
  ONBOARDING_SURVEY_SUBMITTED: "onboarding_survey_submitted",
  SPONSOR_CLICKED: "sponsor_clicked",
  INSTANCE_STARTED: "instance_started",
  EDITOR_OPENED: "editor_opened",
  EDITOR_TOOL_USED: "editor_tool_used",
  EDITOR_EXPORTED: "editor_exported",
  PIPELINE_OPENED: "pipeline_opened",
  PIPELINE_STEP_ADDED: "pipeline_step_added",
  PIPELINE_SAVED: "pipeline_saved",
  PIPELINE_TEMPLATE_SELECTED: "pipeline_template_selected",
  AUTH_LOGIN: "auth_login",
  AUTH_LOGIN_FAILED: "auth_login_failed",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export interface ToolUsedProperties {
  tool_id: string;
  status: "completed" | "failed";
  duration_ms: number;
  category: string;
  is_ai_tool: boolean;
  is_batch: boolean;
  /** Safe input extension (never the filename), e.g. "heic"; "unknown" if none. */
  input_format: string;
  execution_hint: "fast" | "long";
  output_format?: string;
  bytes_in?: number;
  bytes_out?: number;
  error_code?: string;
  /** Coarse failure reason so "why do tools fail" is answerable without messages. */
  error_kind?: "input" | "operational" | "bug" | "timeout" | "cancelled";
}

export interface SearchProperties {
  results_count: number;
  clicked_tool_id?: string;
}

export interface PipelineExecutedProperties {
  step_count: number;
  tool_ids: string[];
  is_batch: boolean;
  file_count?: number;
  duration_ms: number;
  status: "completed" | "failed";
}

export interface AiBundleActionProperties {
  bundle_id: string;
  action: "installed" | "uninstalled";
  duration_ms: number;
}

export interface InstanceStartedProperties {
  arch: "arm64" | "amd64";
  os_platform: string;
  deploy_mode: "embedded" | "external" | "native";
  gpu_present: boolean;
}

export interface EditorToolUsedProperties {
  /** The editor tool selected (move, brush, crop, ...); a fixed low-cardinality set. */
  editor_tool: string;
}

export interface EditorExportedProperties {
  output_format?: string;
}

export interface PipelineStepAddedProperties {
  tool_id: string;
}

export interface PipelineSavedProperties {
  step_count: number;
}

export interface PipelineTemplateSelectedProperties {
  template_id: string;
}
