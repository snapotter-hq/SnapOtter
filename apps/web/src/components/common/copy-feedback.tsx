import { useTranslation } from "@/contexts/i18n-context";

export type CopyFeedbackStatus = "idle" | "copied" | "failed" | { ok: boolean } | null;

/**
 * Visually hidden status region that announces "Copied!" or "Copy failed" to
 * screen readers when a copy button settles (#1938). Renders nothing while idle
 * so panels with multiple copy controls only mount a single status region when
 * one of them fires.
 */
export function CopyFeedback({ status }: { status: CopyFeedbackStatus }) {
  const { t } = useTranslation();
  const outcome =
    status === null || status === "idle"
      ? null
      : typeof status === "object"
        ? status.ok
          ? "copied"
          : "failed"
        : status;
  if (outcome === null) return null;
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {outcome === "copied" ? t.common.copied : t.common.copyFailed}
    </span>
  );
}
