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
  SPONSOR_CLICKED: "sponsor_clicked",
  INSTANCE_STARTED: "instance_started",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export interface ToolUsedProperties {
  tool_id: string;
  status: "completed" | "failed";
  duration_ms: number;
  category: string;
  is_ai_tool: boolean;
  params?: Record<string, string | number | boolean>;
  error_code?: string;
  error_message?: string;
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
