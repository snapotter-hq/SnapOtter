import { MessageSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { trackFeedbackPromptDismissed, trackFeedbackPromptShown } from "@/lib/feedback";

interface AdminInstallFeedbackCardProps {
  visible: boolean;
  onShare: () => void;
  onRemindLater: () => void;
  onDismissForever: () => void;
}

export function AdminInstallFeedbackCard({
  visible,
  onShare,
  onRemindLater,
  onDismissForever,
}: AdminInstallFeedbackCardProps) {
  const { t } = useTranslation();
  const shownTrackedRef = useRef(false);

  // Impression once the card first renders, so the settings-page install
  // feedback has a shown-vs-acted denominator like the other surfaces.
  useEffect(() => {
    if (visible && !shownTrackedRef.current) {
      shownTrackedRef.current = true;
      trackFeedbackPromptShown("admin_installer");
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <MessageSquare className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h5 className="text-sm font-semibold text-foreground">{t.feedback.adminCardTitle}</h5>
          <p className="text-xs text-muted-foreground">{t.feedback.adminCardDescription}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onShare}
          className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t.feedback.shareFeedback}
        </button>
        <button
          type="button"
          onClick={() => {
            trackFeedbackPromptDismissed("admin_installer", "snooze");
            onRemindLater();
          }}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground"
        >
          {t.feedback.remindLater}
        </button>
        <button
          type="button"
          onClick={() => {
            trackFeedbackPromptDismissed("admin_installer", "dont_ask_again");
            onDismissForever();
          }}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground"
        >
          {t.feedback.dontAskAgain}
        </button>
      </div>
    </div>
  );
}
