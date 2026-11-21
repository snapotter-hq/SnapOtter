import { NO_TEXT_LAYER_CODE, TOOLS } from "@snapotter/shared";
import { useNavigate } from "react-router";
import { type FileEntry, useFileStore } from "@/stores/file-store";

const OCR_TOOL = TOOLS.find((tool) => tool.id === "ocr-pdf");

interface ScannedPdfOcrHandoffProps {
  hint: string;
  label: string;
  testId: string;
}

function hasUnreadablePages(entry: FileEntry): boolean {
  return entry.status === "completed" && entry.resultNotes?.unreadablePages != null;
}

/**
 * Moves the files that `keep` accepts into the OCR tool and drops the rest
 * from the store. The kept files stay loaded across the navigation
 * (`fromLibrary`), so OCR starts with them and nothing is uploaded until it runs.
 */
function useOcrHandoff() {
  const navigate = useNavigate();
  return (keep: (entry: FileEntry) => boolean) => {
    if (!OCR_TOOL) return;
    const { entries, removeFile, setError, undoProcessing } = useFileStore.getState();
    setError(null);
    for (let i = entries.length - 1; i >= 0; i--) {
      if (!keep(entries[i])) removeFile(i);
    }
    // A successful run leaves its result and batch zip on the kept files,
    // which the OCR page would otherwise show as its own finished result.
    undoProcessing();
    navigate(OCR_TOOL.route, { state: { fromLibrary: true } });
  };
}

function OcrHandoffButton({
  label,
  testId,
  onClick,
}: {
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full py-2.5 rounded-lg border border-border font-medium hover:bg-muted"
    >
      {label}
    </button>
  );
}

/**
 * Offers OCR when the server refused a PDF for having no text layer. Renders
 * nothing for any other failure.
 */
export function ScannedPdfOcrHandoff({ hint, label, testId }: ScannedPdfOcrHandoffProps) {
  const { error, errorCode } = useFileStore();
  const handoffToOcr = useOcrHandoff();

  // A batch only carries the code when every file failed on it (the server
  // withholds it from a mixed batch), so the handoff never drags readable PDFs
  // into OCR (#4143).
  if (!OCR_TOOL || !error || errorCode !== NO_TEXT_LAYER_CODE) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <OcrHandoffButton label={label} testId={testId} onClick={() => handoffToOcr(() => true)} />
    </div>
  );
}

/**
 * Offers OCR after a successful run whose current file had pages with no
 * readable text (#5150). Only the files flagged that way go to OCR, so the
 * readable ones in a batch stay out of it, the same rule as #4143.
 */
export function UnreadablePagesOcrHandoff({ label, testId }: { label: string; testId: string }) {
  const { currentEntry } = useFileStore();
  const handoffToOcr = useOcrHandoff();

  if (!OCR_TOOL || !currentEntry || !hasUnreadablePages(currentEntry)) return null;

  return (
    <OcrHandoffButton
      label={label}
      testId={testId}
      onClick={() => handoffToOcr(hasUnreadablePages)}
    />
  );
}
