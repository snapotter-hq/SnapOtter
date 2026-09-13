import { SECTIONS } from "@snapotter/shared";
import { useLocation } from "react-router";
import { useBase64Store } from "@/stores/base64-store";
import { useCollageStore } from "@/stores/collage-store";
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useEditorStore } from "@/stores/editor-store";
import { useFileStore } from "@/stores/file-store";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";
import { useMemeStore } from "@/stores/meme-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import { useSplitStore } from "@/stores/split-store";

/**
 * One unclaimed result the guard can offer to download before leaving.
 *
 * A closed union, so a consumer that switches on `kind` cannot silently skip a
 * value that carries neither a url nor a blob. `kind` also tells a caller which
 * case it is holding without inferring it from the array's shape: only a zip
 * claims the whole batch.
 */
export type GuardDownload =
  | {
      kind: "result";
      /** The file-store entry this came from. Carried so a caller claims the
       *  entries it actually downloaded, rather than re-reading the store a
       *  tick later and claiming a result that landed in between. */
      index: number;
      /** Usually an API download URL from the server, and a blob URL after a
       *  batch run settles from the zip. Hand it to triggerDownload; it is not
       *  always revocable and the store owns it. */
      url: string;
      filename: string;
    }
  | { kind: "zip"; blob: Blob; filename: string };

export type WorkReason =
  | { kind: "processing" }
  | { kind: "unsaved"; downloads: GuardDownload[] }
  | { kind: "editor-dirty" };

const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

/**
 * The tools whose results never reach the file store: each keeps them in a
 * store of its own, so the file-store checks below can never see them.
 *
 * Exported for the drift test, which walks the tool catalog and fails when a
 * tool that bypasses useToolProcessor is neither listed here nor explicitly
 * exempted. Without that, the next tool to invent its own store goes unguarded
 * and nothing says so.
 *
 * qr-generate and barcode-generate are deliberately absent: their stores hold
 * the typed config, not a result, and the image is redrawn client-side the
 * moment the page comes back, so leaving costs nothing.
 */
export const OWN_STORE_TOOL_IDS = [
  "collage",
  "find-duplicates",
  "html-to-image",
  "image-to-base64",
  "meme-generator",
  "pdf-to-image",
  "split",
] as const;

type OwnStoreToolId = (typeof OWN_STORE_TOOL_IDS)[number];

/** What one of those stores says about the page: mid-run, or holding a result. */
interface OwnStoreWork {
  busy: boolean;
  unsaved: boolean;
}

/**
 * Lowercase, and drop one trailing slash, so "/EDITOR/" matches "/editor". "/"
 * stays itself. React Router matches routes case-insensitively unless a route
 * opts in to caseSensitive, which none here do, so "/EDITOR" renders the editor
 * and the guard has to recognise it.
 *
 * Exported because the navigation blocker compares pathnames too. Both halves
 * of the guard have to spell a path the same way or they disagree about which
 * page you are on.
 */
export function normalizePath(pathname: string): string {
  const lower = pathname.toLowerCase();
  return lower.length > 1 && lower.endsWith("/") ? lower.slice(0, -1) : lower;
}

/**
 * The tool id from a "/:section/:toolId" route, or null anywhere else. The
 * filter drops the empty segment a trailing slash leaves behind.
 */
function toolIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length === 2 && SECTION_IDS.has(parts[0]) ? parts[1] : null;
}

/**
 * The routes that own file-store state. The store is global and only
 * tool-page clears it, so an unscoped guard would fire on unrelated pages
 * visited after a run.
 */
function ownsFileStore(pathname: string): boolean {
  return pathname === "/automate" || toolIdFromPath(pathname) !== null;
}

/**
 * Whether leaving this page right now throws work away, and what could be
 * downloaded first. Returns null when there is nothing to lose.
 *
 * The return value is rebuilt every render and is never referentially stable,
 * so it is not a change signal: key on `reason !== null`, not on the object
 * identity. Memoizing would not help, because `entries` is itself a fresh array
 * on exactly the updates that matter here.
 */
export function useWorkInFlight(): WorkReason | null {
  const { pathname } = useLocation();
  const processing = useFileStore((s) => s.processing);
  const entries = useFileStore((s) => s.entries);
  const batchZipBlob = useFileStore((s) => s.batchZipBlob);
  const batchZipFilename = useFileStore((s) => s.batchZipFilename);
  const batchZipClaimed = useFileStore((s) => s.batchZipClaimed);
  const editorDirty = useEditorStore((s) => s.isDirty);

  // The stores behind OWN_STORE_TOOL_IDS. Subscribed unconditionally, as the
  // rules of hooks require; the route decides which one is worth reading.
  const collagePhase = useCollageStore((s) => s.phase);
  const collageResultUrl = useCollageStore((s) => s.resultUrl);
  const duplicateScanning = useDuplicateStore((s) => s.scanning);
  const duplicateResults = useDuplicateStore((s) => s.results);
  const captureRunning = useHtmlToImageStore((s) => s.capturing);
  const captureResultUrl = useHtmlToImageStore((s) => s.resultUrl);
  const base64Processing = useBase64Store((s) => s.processing);
  const base64Results = useBase64Store((s) => s.results);
  const memeGenerating = useMemeStore((s) => s.generating);
  const memeResultUrl = useMemeStore((s) => s.resultUrl);
  const pdfToImageProcessing = usePdfToImageStore((s) => s.processing);
  const pdfToImageResults = usePdfToImageStore((s) => s.results);
  const pdfToImageZipUrl = usePdfToImageStore((s) => s.zipUrl);
  const splitProcessing = useSplitStore((s) => s.processing);
  const splitTiles = useSplitStore((s) => s.tiles);
  const splitZipBlobUrl = useSplitStore((s) => s.zipBlobUrl);

  const path = normalizePath(pathname);

  if (ownsFileStore(path)) {
    // Ahead of the file store, which for these tools holds the input and never
    // the answer. A tool that lands nothing here still falls through, so this
    // only ever adds coverage.
    const ownStoreWork: Record<OwnStoreToolId, OwnStoreWork> = {
      collage: { busy: collagePhase === "processing", unsaved: collageResultUrl !== null },
      "find-duplicates": { busy: duplicateScanning, unsaved: duplicateResults !== null },
      "html-to-image": { busy: captureRunning, unsaved: captureResultUrl !== null },
      "image-to-base64": { busy: base64Processing, unsaved: base64Results.length > 0 },
      "meme-generator": { busy: memeGenerating, unsaved: memeResultUrl !== null },
      "pdf-to-image": {
        busy: pdfToImageProcessing,
        unsaved: (pdfToImageResults?.length ?? 0) > 0 || pdfToImageZipUrl !== null,
      },
      split: {
        busy: splitProcessing,
        unsaved: splitTiles.length > 0 || splitZipBlobUrl !== null,
      },
    };

    // Widened on the way out, not on the way in: the Record above is keyed by
    // OwnStoreToolId so a new id there has to bring its store reading with it.
    const byToolId: Record<string, OwnStoreWork | undefined> = ownStoreWork;
    const toolId = toolIdFromPath(path);
    const own = toolId ? byToolId[toolId] : undefined;
    if (own?.busy) return { kind: "processing" };
    // Warn only. These results come in too many shapes (two kinds of zip, three
    // plain urls, text, a report) to offer as downloads from here.
    if (own?.unsaved) return { kind: "unsaved", downloads: [] };

    if (processing) return { kind: "processing" };

    // Nothing gates the zip on the entries having results. A batch settles by
    // storing the zip first and filling in per-entry results after, so a run
    // that fails that second half leaves a real, downloadable zip behind with
    // no entry carrying a processedUrl. setFiles already clears a zip that
    // outlived its file set, so there is no stale zip left to screen out.
    if (batchZipBlob && !batchZipClaimed) {
      return {
        kind: "unsaved",
        downloads: [
          { kind: "zip", blob: batchZipBlob, filename: batchZipFilename ?? "processed-files.zip" },
        ],
      };
    }

    // Key on processedUrl, NOT on status === "completed". A result is a thing
    // the user can lose; a status is not.
    const downloads: GuardDownload[] = entries.flatMap((e, index) =>
      e.processedUrl && !e.claimed
        ? [
            {
              kind: "result" as const,
              index,
              url: e.processedUrl,
              filename: e.processedFilename ?? e.file.name,
            },
          ]
        : [],
    );
    if (downloads.length > 0) return { kind: "unsaved", downloads };
  }

  if (path === "/editor" && editorDirty) return { kind: "editor-dirty" };

  return null;
}
