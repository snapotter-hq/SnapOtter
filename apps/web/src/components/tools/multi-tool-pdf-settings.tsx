import { PDF_MULTI_TOOL_LIMITS } from "@snapotter/shared";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";
import { useMultiToolStore } from "@/stores/multi-tool-store";

/**
 * The canvas and settings share the plan; docs follow file-store upload
 * order so server-side document indexes match the plan.
 */
export function MultiToolPdfSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["multi-tool-pdf"];
  const { files } = useFileStore();
  const docs = useMultiToolStore((state) => state.docs);
  const plan = useMultiToolStore((state) => state.plan);
  const { processFiles, processing, error, progress } = useToolProcessor("multi-tool-pdf");

  const primary = files[0];
  const ready = docs.length > 0 && docs.every((d) => d.pageCount > 0 && !d.failed);
  const withinLimits =
    docs.length <= PDF_MULTI_TOOL_LIMITS.documents &&
    plan.length <= PDF_MULTI_TOOL_LIMITS.outputPages;
  const aligned = docs.length === files.length && docs.every((d, i) => d.file === files[i]);
  const canSubmit = Boolean(primary) && ready && aligned && withinLimits && plan.length > 0;

  const handleProcess = () => {
    if (!canSubmit || processing) return;

    // MULTI_FILE_TOOLS appends every document in plan-index order.
    const uploads = docs.map((d) => d.file);
    const pageCounts = docs.map((d) => d.pageCount);
    const items = plan.map((p) => ({
      doc: p.doc,
      page: p.page,
      ...(p.rot !== 0 ? { rot: p.rot } : {}),
    }));

    processFiles(uploads, { items, pageCounts });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {format(s.planSummary, { pages: plan.length, docs: docs.length })}
      </p>
      <p className={`text-xs ${withinLimits ? "text-muted-foreground" : "text-destructive-ink"}`}>
        {format(s.limitsHint, {
          docs: PDF_MULTI_TOOL_LIMITS.documents,
          pages: PDF_MULTI_TOOL_LIMITS.outputPages,
        })}
      </p>

      {docs.some((d) => d.failed) && <p className="text-xs text-destructive-ink">{s.docFailed}</p>}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={s.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="multi-tool-pdf-submit"
          onClick={handleProcess}
          disabled={!canSubmit || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {format(s.submit, { pages: plan.length })}
        </button>
      )}
    </div>
  );
}
