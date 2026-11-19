import { NO_TEXT_LAYER_CODE, TOOLS } from "@snapotter/shared";
import { useNavigate } from "react-router";
import { useFileStore } from "@/stores/file-store";

const OCR_TOOL = TOOLS.find((tool) => tool.id === "ocr-pdf");

interface ScannedPdfOcrHandoffProps {
  hint: string;
  label: string;
  testId: string;
}

/**
 * Offers OCR when the server refused a PDF for having no text layer. Renders
 * nothing for any other failure.
 */
export function ScannedPdfOcrHandoff({ hint, label, testId }: ScannedPdfOcrHandoffProps) {
  const { error, errorCode } = useFileStore();
  const navigate = useNavigate();

  // A batch only carries the code when every file failed on it (the server
  // withholds it from a mixed batch), so the handoff never drags readable PDFs
  // into OCR (#4143).
  if (!OCR_TOOL || !error || errorCode !== NO_TEXT_LAYER_CODE) return null;

  // The files stay in the store across the navigation (`fromLibrary`), so OCR
  // starts with the PDF already loaded and nothing is uploaded until it runs.
  const handoffToOcr = () => {
    const store = useFileStore.getState();
    store.setError(null);
    store.entries.forEach((entry) => {
      store.updateEntryById(entry.id, { status: "pending", error: null });
    });
    navigate(OCR_TOOL.route, { state: { fromLibrary: true } });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <button
        type="button"
        data-testid={testId}
        onClick={handoffToOcr}
        className="w-full py-2.5 rounded-lg border border-border font-medium hover:bg-muted"
      >
        {label}
      </button>
    </div>
  );
}
