import { en } from "@ashim/shared";
import { Shield } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAnalyticsStore } from "@/stores/analytics-store";

const t = en.analytics;

export function AnalyticsConsentPage() {
  const navigate = useNavigate();
  const { config, configLoaded, fetchConfig, acceptAnalytics, remindLater } = useAnalyticsStore();

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (configLoaded && !config?.enabled) {
      navigate("/", { replace: true });
    }
  }, [configLoaded, config, navigate]);

  if (!configLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleAccept = async () => {
    await acceptAnalytics();
    window.location.href = "/";
  };

  const handleDecline = async () => {
    await remindLater();
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[400px] space-y-6 rounded-2xl border border-border bg-card p-9 shadow-lg">
        <div className="flex justify-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-[22px] w-[22px] text-primary" />
          </div>
        </div>

        <div className="space-y-3 text-center">
          <h1 className="text-lg font-semibold text-foreground">{t.consentTitle}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{t.consentDescription}</p>
        </div>

        <p className="text-center text-xs text-muted-foreground/60">{t.consentChangeable}</p>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleAccept}
            className="flex-1 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t.acceptButton}
          </button>
          <button
            type="button"
            onClick={handleDecline}
            className="flex-1 rounded-[10px] border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            {t.declineButton}
          </button>
        </div>
      </div>
    </div>
  );
}
