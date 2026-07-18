import { LIBRARY_SAVE_MODE_UNSUPPORTED_TOOLS } from "@snapotter/shared";
import { useTranslation } from "@/contexts/i18n-context";
import { MULTI_FILE_TOOLS } from "@/lib/tool-display-modes";
import { useFileStore } from "@/stores/file-store";

/**
 * Per-edit choice for library-sourced files (#495): save the processed result
 * to the file library as a new file (default, keeps the original) or
 * overwrite the original. Renders nothing when the choice would not be
 * honored: entry not linked to a library file, tool whose route or submitter
 * ignores the saveMode field, or a multi-file batch run (batches never send
 * fileId, so nothing is auto-saved).
 */
export function LibrarySaveModeSelector({ toolId }: { toolId: string }) {
  const { t } = useTranslation();
  const currentEntry = useFileStore((s) => s.currentEntry);
  const entries = useFileStore((s) => s.entries);
  const librarySaveMode = useFileStore((s) => s.librarySaveMode);
  const setLibrarySaveMode = useFileStore((s) => s.setLibrarySaveMode);
  const processing = useFileStore((s) => s.processing);

  if (!currentEntry?.serverFileId) return null;
  if (LIBRARY_SAVE_MODE_UNSUPPORTED_TOOLS.has(toolId)) return null;
  const isBatchRun = entries.length > 1 && !MULTI_FILE_TOOLS.has(toolId);
  if (isBatchRun) return null;

  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        {t.toolPage.librarySaveTitle}
      </legend>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="radio"
          name="library-save-mode"
          className="mt-1"
          checked={librarySaveMode === "new"}
          onChange={() => setLibrarySaveMode("new")}
          disabled={processing}
        />
        <span>
          {t.toolPage.librarySaveAsNew}
          <span className="block text-xs text-muted-foreground">
            {t.toolPage.librarySaveAsNewHint}
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="radio"
          name="library-save-mode"
          className="mt-1"
          checked={librarySaveMode === "overwrite"}
          onChange={() => setLibrarySaveMode("overwrite")}
          disabled={processing}
        />
        <span>
          {t.toolPage.libraryOverwrite}
          <span className="block text-xs text-muted-foreground">
            {t.toolPage.libraryOverwriteHint}
          </span>
        </span>
      </label>
    </fieldset>
  );
}
