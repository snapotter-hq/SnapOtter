import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

/** The outline button most tool settings panels use for their result. */
const DEFAULT_CLASS_NAME =
  "w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5";

/** The solid variant, for panels whose result button is the primary action. */
export const SOLID_CLASS_NAME =
  "bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium";

interface ResultDownloadLinkProps {
  href: string;
  testId?: string;
  /** Replaces the default classes entirely; they are not merged. */
  className?: string;
  /** Text beside the icon. Defaults to the shared "Download" string. */
  label?: ReactNode;
  /** The whole contents of the link, icon included. Prefer `label` unless the
   *  icon itself has to go. */
  children?: ReactNode;
  /** Filename to force on the saved file; omit to let the response name it. */
  downloadName?: string;
}

/**
 * Download link for the result held in the file store. Tool settings panels use
 * this so the claim lands where the user takes their file. Sites that build
 * their anchor imperatively still do not claim (#1111).
 */
export function ResultDownloadLink({
  href,
  testId,
  className,
  label,
  children,
  downloadName,
}: ResultDownloadLinkProps) {
  const { t } = useTranslation();

  return (
    <a
      href={href}
      download={downloadName ?? true}
      data-testid={testId}
      className={className ?? DEFAULT_CLASS_NAME}
      // The result is being taken, so the navigation guard has nothing left to
      // warn about for this entry.
      onClick={() => useFileStore.getState().claimSelected()}
    >
      {children ?? (
        <>
          <Download className="h-4 w-4" />
          {label ?? t.common.download}
        </>
      )}
    </a>
  );
}
