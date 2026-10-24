import { ANALYTICS_EVENTS, TOOLS } from "@snapotter/shared";
import { Download } from "lucide-react";
import { type ReactNode, useContext } from "react";
import { UNSAFE_LocationContext, useParams } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { track } from "@/lib/analytics";
import { BASE_PATH } from "@/lib/app-url";
import { useFileStore } from "@/stores/file-store";

const TOOL_IDS = new Set<string>(TOOLS.map((t) => t.id));
const TOOL_IDS_BY_ROUTE = new Map<string, string>(TOOLS.map((t) => [t.route, t.id]));

function toolIdFromPathname(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const path = BASE_PATH && raw.startsWith(`${BASE_PATH}/`) ? raw.slice(BASE_PATH.length) : raw;
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1).toLowerCase() : path.toLowerCase();
  return TOOL_IDS_BY_ROUTE.get(normalized);
}

function toolIdFromTestId(testId: string | undefined): string | undefined {
  if (!testId?.endsWith("-download")) return undefined;
  const candidate = testId.slice(0, -"-download".length);
  if (candidate === "blur-bg") return "blur-background";
  return TOOL_IDS.has(candidate) ? candidate : undefined;
}

/** The outline button most tool settings panels use for their result. */
const DEFAULT_CLASS_NAME =
  "w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5";

/** The solid variant, for panels whose result button is the primary action. */
export const SOLID_CLASS_NAME =
  "bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium";

interface ResultDownloadLinkProps {
  href: string;
  testId?: string;
  /** Tool id for analytics; defaults to the active route's toolId. */
  toolId?: string;
  /** Replaces the default classes entirely; they are not merged. */
  className?: string;
  /** Text beside the icon. Defaults to the shared "Download" string. */
  label?: ReactNode;
  /** The whole contents of the link, icon included. Prefer `label` unless the
   *  icon itself has to go. */
  children?: ReactNode;
  /** Filename to force on the saved file; omit to let the response name it. */
  downloadName?: string;
  /** Entry id to claim on click; defaults to the currently selected entry. */
  claimEntryId?: string;
}

/**
 * Download link for the result held in the file store. Tool settings panels use
 * this so the claim lands where the user takes their file. Sites that build
 * their anchor imperatively still do not claim (#1111).
 */
export function ResultDownloadLink({
  href,
  testId,
  toolId,
  className,
  label,
  children,
  downloadName,
  claimEntryId,
}: ResultDownloadLinkProps) {
  const { t } = useTranslation();
  const params = useParams<{ toolId?: string }>();
  const routerLocation = useContext(UNSAFE_LocationContext)?.location;

  return (
    <a
      href={href}
      download={downloadName ?? true}
      data-testid={testId}
      className={className ?? DEFAULT_CLASS_NAME}
      // The result is being taken, so the navigation guard has nothing left to
      // warn about for this entry.
      onClick={() => {
        const resolvedToolId =
          toolId ||
          params.toolId ||
          toolIdFromPathname(routerLocation?.pathname) ||
          toolIdFromPathname(
            typeof window !== "undefined" ? window.location?.pathname : undefined,
          ) ||
          toolIdFromTestId(testId);
        if (resolvedToolId) {
          track(ANALYTICS_EVENTS.RESULT_DOWNLOADED, { tool_id: resolvedToolId });
        }
        const store = useFileStore.getState();
        if (claimEntryId !== undefined) {
          store.markClaimedById(claimEntryId);
        } else {
          store.claimSelected();
        }
      }}
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
