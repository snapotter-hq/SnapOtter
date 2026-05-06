export const ANALYTICS_EVENTS = {
  TOOL_USED: "tool_used",
  SEARCH: "search",
  PIPELINE_EXECUTED: "pipeline_executed",
  AI_BUNDLE_ACTION: "ai_bundle_action",
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
  query: string;
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
