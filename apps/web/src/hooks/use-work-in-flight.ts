import { SECTIONS } from "@snapotter/shared";
import { useLocation } from "react-router";
import { useEditorStore } from "@/stores/editor-store";
import { useFileStore } from "@/stores/file-store";

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
 * The routes that own file-store state. The store is global and only
 * tool-page clears it, so an unscoped guard would fire on unrelated pages
 * visited after a run.
 */
function ownsFileStore(pathname: string): boolean {
  if (pathname === "/automate") return true;
  const parts = pathname.split("/").filter(Boolean);
  return parts.length === 2 && SECTION_IDS.has(parts[0]);
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

  const path = normalizePath(pathname);

  if (ownsFileStore(path)) {
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
