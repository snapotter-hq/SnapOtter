import { APP_VERSION, type LatestRelease } from "@snapotter/shared";
import { ArrowUpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { format } from "@/lib/format";
import {
  dismissUpdateNotice,
  fetchNewerRelease,
  isUpdateNoticeDismissed,
} from "@/lib/update-notice";

/**
 * Tells admins a newer SnapOtter release is out. The API learns the latest
 * version from PostHog, so instances with analytics off never see this.
 */
export function UpdateNotice() {
  const { t } = useTranslation();
  const { loading, hasPermission } = useAuth();
  const canManage = !loading && hasPermission("settings:write");
  const [release, setRelease] = useState<LatestRelease | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    fetchNewerRelease(APP_VERSION).then((latest) => {
      if (!cancelled && latest && !isUpdateNoticeDismissed(latest.version)) setRelease(latest);
    });
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  if (!canManage || !release) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm text-foreground"
    >
      <ArrowUpCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-start">
        {format(t.appLayout.updateNotice.available, {
          version: release.version,
          current: APP_VERSION,
        })}{" "}
        <a
          href={release.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary-ink underline-offset-2 hover:underline"
        >
          {t.appLayout.updateNotice.whatsNew}
        </a>
      </p>
      <button
        type="button"
        onClick={() => {
          dismissUpdateNotice(release.version);
          setRelease(null);
        }}
        aria-label={t.appLayout.updateNotice.dismiss}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
