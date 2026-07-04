import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiPut } from "@/lib/api";
import { parseMigrationMarker, shouldShowMigrationBanner } from "@/lib/feedback";
import { format } from "@/lib/format";
import { withTimeout } from "@/lib/with-timeout";

// A hung write must not leave the dismiss button stuck; time it out so the admin
// can retry (worst case the banner reappears next load, which is harmless).
const WRITE_TIMEOUT_MS = 15_000;

/**
 * One-time admin banner announcing the result of a 1.x SQLite import (or warning
 * that a 1.x database was found but not imported). Reads the `sqlite_import`
 * marker from the settings payload and persists dismissal to a settings key,
 * mirroring the usage-survey overlay pattern.
 */
export function MigrationBanner() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (role !== "admin") return;
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => {
        // Fail closed: no settings means we cannot know the import state, so we
        // simply do not show the banner for this load.
      });
  }, [role]);

  if (settings === null || !shouldShowMigrationBanner({ settings, role })) return null;
  const marker = parseMigrationMarker(settings.sqlite_import);
  if (!marker) return null;

  const locked = marker.status === "detected_locked";
  const users = marker.tables?.users ?? 0;
  const files = marker.tables?.user_files ?? 0;

  async function dismiss() {
    if (dismissing) return;
    setDismissing(true);
    const value = new Date().toISOString();
    try {
      await withTimeout(
        apiPut("/v1/settings", { "sqlite_import.dismissedAt": value }),
        WRITE_TIMEOUT_MS,
      );
      setSettings((current) => ({ ...(current ?? {}), "sqlite_import.dismissedAt": value }));
    } catch {
      // Leave it visible next load; a failed dismiss is low-stakes.
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-[55] flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium ${
        locked
          ? "bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50"
          : "bg-emerald-500 text-emerald-950 dark:bg-emerald-600 dark:text-emerald-50"
      }`}
    >
      {locked ? (
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="text-center">
        <span className="font-semibold">
          {locked ? t.migrationBanner.warningTitle : t.migrationBanner.successTitle}
        </span>{" "}
        {locked
          ? t.migrationBanner.warningBody
          : format(t.migrationBanner.successBody, { users, files })}
      </span>
      <button
        type="button"
        onClick={dismiss}
        disabled={dismissing}
        aria-label={t.migrationBanner.dismiss}
        className="shrink-0 rounded p-0.5 hover:bg-black/10 disabled:opacity-50"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
