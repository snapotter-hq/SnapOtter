import { MessageSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import {
  type FeedbackErrorCategory,
  type FeedbackSentiment,
  promptVariantForSource,
  submitFeedback,
  surveyIdForSource,
  trackFeedbackPromptDismissed,
  trackFeedbackPromptShown,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useAnalyticsStore } from "@/stores/analytics-store";
import { FeedbackDialog } from "./feedback-dialog";

interface ToolFeedbackPromptProps {
  toolId: string;
  jobStatus?: "completed" | "failed";
  errorCategory?: FeedbackErrorCategory;
}

const GLOBAL_LAST_PROMPT_KEY = "snapotter-feedback-last-prompt-at";
const GLOBAL_LAST_SHOWN_KEY = "snapotter-feedback-last-shown-at";
const PROMPTS_DISABLED_KEY = "snapotter-feedback-prompts-disabled";
const TOOL_PROMPT_PREFIX = "snapotter-feedback-tool-prompt:";
const GLOBAL_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const TOOL_PROMPT_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
// A prompt that was merely shown (not acted on) still arms a short cooldown so an
// ignored card does not reappear on the very next result. Interacting arms the much
// longer cooldowns above.
const SHOWN_PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

function readNumber(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeNow(key: string): void {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // ignore storage failures
  }
}

function promptsDisabled(): boolean {
  try {
    return localStorage.getItem(PROMPTS_DISABLED_KEY) === "true";
  } catch {
    return false;
  }
}

function disablePrompts(): void {
  try {
    localStorage.setItem(PROMPTS_DISABLED_KEY, "true");
  } catch {
    // ignore storage failures
  }
}

function shouldShowPrompt(toolId: string): boolean {
  if (!toolId || promptsDisabled()) return false;
  const now = Date.now();
  const lastShown = readNumber(GLOBAL_LAST_SHOWN_KEY);
  if (lastShown && now - lastShown < SHOWN_PROMPT_COOLDOWN_MS) return false;
  const lastGlobal = readNumber(GLOBAL_LAST_PROMPT_KEY);
  if (lastGlobal && now - lastGlobal < GLOBAL_PROMPT_COOLDOWN_MS) return false;
  const lastTool = readNumber(`${TOOL_PROMPT_PREFIX}${toolId}`);
  if (lastTool && now - lastTool < TOOL_PROMPT_COOLDOWN_MS) return false;
  return true;
}

function markPromptHandled(toolId: string): void {
  writeNow(GLOBAL_LAST_PROMPT_KEY);
  writeNow(`${TOOL_PROMPT_PREFIX}${toolId}`);
}

function markPromptShown(): void {
  writeNow(GLOBAL_LAST_SHOWN_KEY);
}

export function ToolFeedbackPrompt({
  toolId,
  jobStatus = "completed",
  errorCategory,
}: ToolFeedbackPromptProps) {
  const { t } = useTranslation();
  const analyticsConfig = useAnalyticsStore((s) => s.config);
  const analyticsLoaded = useAnalyticsStore((s) => s.configLoaded);
  const [visible, setVisible] = useState(false);
  const [dialogSentiment, setDialogSentiment] = useState<FeedbackSentiment | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [thanks, setThanks] = useState(false);
  const source = jobStatus === "failed" ? "failed_job" : "tool_result";

  useEffect(() => {
    if (!analyticsLoaded || !analyticsConfig?.enabled) return;
    const show = shouldShowPrompt(toolId);
    if (show) {
      markPromptShown();
      trackFeedbackPromptShown(source);
    }
    setVisible(show);
  }, [analyticsLoaded, analyticsConfig?.enabled, toolId, source]);

  if (!analyticsLoaded || !analyticsConfig?.enabled) return null;
  if (!visible && !thanks && !dialogOpen) return null;

  async function handleQuickSentiment(sentiment: FeedbackSentiment) {
    if (sentiment === "great") {
      markPromptHandled(toolId);
      setVisible(false);
      setThanks(true);
      try {
        await submitFeedback({
          source,
          surveyId: surveyIdForSource(source),
          promptVariant: promptVariantForSource(source),
          sentiment,
          feedbackType: "other",
          toolId,
          jobStatus,
          errorCategory,
        });
      } catch {
        // Explicit feedback is best-effort; keep the user flow calm.
      }
      return;
    }

    setDialogSentiment(sentiment);
    setDialogOpen(true);
  }

  function handleDismiss() {
    markPromptHandled(toolId);
    trackFeedbackPromptDismissed(source, "close");
    setVisible(false);
  }

  function handleDontAskAgain() {
    disablePrompts();
    trackFeedbackPromptDismissed(source, "dont_ask_again");
    setVisible(false);
  }

  function handleSubmitted() {
    markPromptHandled(toolId);
    setVisible(false);
    setThanks(true);
  }

  return (
    <>
      {visible && (
        <div className="rounded-lg border border-border bg-muted/35 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <MessageSquare className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t.feedback.toolPromptTitle}</p>
              <p className="text-xs text-muted-foreground">{t.feedback.toolPromptDescription}</p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t.feedback.dismissPrompt}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["great", "issue", "missing"] as FeedbackSentiment[]).map((sentiment) => (
              <button
                key={sentiment}
                type="button"
                onClick={() => handleQuickSentiment(sentiment)}
                className={cn(
                  "rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground",
                  sentiment === "great" && "hover:border-emerald-500/60",
                )}
              >
                {sentiment === "great" ? t.feedback.workedWell : t.feedback.sentiments[sentiment]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleDontAskAgain}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t.feedback.dontAskAgain}
          </button>
        </div>
      )}

      {thanks && <p className="text-xs text-success-ink">{t.feedback.quickThanks}</p>}

      <FeedbackDialog
        open={dialogOpen}
        source={jobStatus === "failed" ? "failed_job" : "tool_result"}
        toolId={toolId}
        jobStatus={jobStatus}
        errorCategory={errorCategory}
        initialSentiment={dialogSentiment}
        onClose={() => setDialogOpen(false)}
        onSubmitted={handleSubmitted}
      />
    </>
  );
}
