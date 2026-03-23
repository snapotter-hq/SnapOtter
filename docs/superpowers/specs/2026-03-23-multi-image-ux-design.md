# Multi-Image UX Redesign

## Problem

When uploading multiple images, the tool page only previews the first image. There's no way to navigate between uploaded files, processing only handles one file, and downloads are single-file only. The strip-metadata tool doesn't show what metadata exists before removing it.

## Design Decisions

- **Processing model**: Hybrid — "Apply to all" batch processing with navigation to preview individual files before/after processing.
- **Thumbnail layout**: Bottom filmstrip strip below the main preview area. Horizontal scroll when many images. Left/right arrows on the main image.
- **Download model**: Individual per-file downloads + "Download All as ZIP" option.
- **Metadata display**: Fully parsed EXIF/GPS/ICC/XMP shown in a categorized table before stripping. GPS gets a red privacy warning badge.

## Architecture

### 1. File Store (`file-store.ts`)

Evolve from single-file state to multi-file aware state.

**Current state**: `files[]`, `originalBlobUrl` (first file only), `processedUrl` (single), `selectedFileName`, `selectedFileSize`.

**New state**:

```typescript
interface FileEntry {
  file: File;
  blobUrl: string;
  /** Server download URL (single-file) or client blob URL (batch/ZIP extraction). */
  processedUrl: string | null;
  processedSize: number | null;
  originalSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
}

interface FileState {
  entries: FileEntry[];
  selectedIndex: number;
  /** Cached ZIP blob from batch processing, for "Download All" button. */
  batchZipBlob: Blob | null;
  batchZipFilename: string | null;
  // Derived getters
  currentEntry: FileEntry | null;
  hasFiles: boolean;
  allProcessed: boolean;
  // Actions
  setFiles: (files: File[]) => void;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  setSelectedIndex: (index: number) => void;
  navigateNext: () => void;
  navigatePrev: () => void;
  updateEntry: (index: number, updates: Partial<FileEntry>) => void;
  setBatchZip: (blob: Blob, filename: string) => void;
  /** Reset all entries to pending state, clear processed results. Replaces the old `undoProcessing()`. */
  undoProcessing: () => void;
  reset: () => void;
}
```

Key changes:
- Blob URLs generated for ALL files, not just first.
- `selectedIndex` replaces `selectedFileName` for navigation.
- Per-file processing state (`status`, `processedUrl`, `processedSize`).
- `processedUrl` can be either a server download path (single-file processing) or a client-side blob URL (from batch ZIP extraction). Both work as `src` for `<img>` or `<a href>`.
- `addFiles()` for the "+ Add more" button (appends to existing).
- `removeFile()` for removing individual files.
- `batchZipBlob` / `batchZipFilename` — cached ZIP blob from batch processing. The "Download All (ZIP)" button uses this directly instead of re-requesting.
- `undoProcessing()` — replaces the old single-file version. Resets all entries' `processedUrl`, `processedSize`, `status` back to `pending`, clears `error`, revokes any client-side blob URLs from processed results, and clears `batchZipBlob`.
- Blob URL cleanup on unmount/reset for all entries.
- Memory: the frontend enforces the same `MAX_BATCH_SIZE` limit as the backend. For large batches, thumbnails use the same blob URLs as the full preview (browser handles scaling via CSS `object-fit`).

### 2. Multi-Image Viewer Component

New `MultiImageViewer` component wraps the existing `ImageViewer`. Only renders the navigation chrome when `entries.length > 1`.

**Structure**:
```
┌──────────────────────────────────┐
│         [zoom toolbar]           │
├──────────────────────────────────┤
│  ‹  │     Main Image       │  › │  ← arrows overlay, "2/5" badge
├──────────────────────────────────┤
│  filename.jpg    4032x3024 2.4MB │
├──────────────────────────────────┤
│ [thumb] [thumb] [thumb] [thumb]  │  ← filmstrip, horizontal scroll
└──────────────────────────────────┘
```

**Props**: Uses file store directly (no props drilling). Renders `ImageViewer` for the currently selected entry, or `BeforeAfterSlider` if the current entry has a `processedUrl`.

**Navigation**:
- Left/right arrow buttons (circular, semi-transparent, positioned over image).
- Keyboard: left/right arrow keys, **only when the viewer container has focus** (not when a tool-specific input like crop handles or text fields is focused). Use `onKeyDown` on the viewer container div with `tabIndex={0}`, not a global listener.
- Click thumbnail to jump to that image.
- "N / M" counter badge in top-right of image area.

**Filmstrip**:
- Horizontal row of thumbnails (52x38px) with 6px gap.
- Active thumbnail has `outline: 2px solid primary` with 1px offset.
- Processed thumbnails have a green checkmark badge (14px circle, top-right corner).
- Failed thumbnails have a red X badge.
- Horizontal scroll via CSS `overflow-x: auto` with `scroll-behavior: smooth`.
- Auto-scroll to keep selected thumbnail visible (use `scrollIntoView({ block: 'nearest', inline: 'nearest' })`).

**Single-file fallback**: When only 1 file is uploaded, render the existing `ImageViewer` directly — no arrows, no filmstrip, no counter. Identical to current behavior.

### 3. Tool Processor (`use-tool-processor.ts`)

Add batch processing alongside the existing single-file processing.

**New method: `processAllFiles(entries, settings)`**:

Uses `fetch()` (not XHR) to POST to `/api/v1/tools/{toolId}/batch`:
- Build `FormData` with all files + settings JSON + `clientJobId`.
- Use `fetch()` so we can read response headers immediately — specifically the `X-Job-Id` header to correlate with SSE progress.

**Batch progress via SSE**:
- The batch endpoint needs a small change: parse `clientJobId` from multipart and use it as the job ID (instead of generating a random one server-side). This lets the client open the SSE connection _before_ the upload completes, matching the existing AI tool pattern.
- SSE events update per-file `status` in the store via `updateEntry()`. The `currentFile` field in `JobProgress` maps to the entry by filename.
- Overall progress: "Processing 3 / 5 files..." shown in a `ProgressCard`.

**ZIP extraction after batch completes**:
- The `fetch()` response body is consumed as a `Blob`.
- The blob is stored in `batchZipBlob` for the "Download All" button.
- Use `fflate` to decompress the ZIP in the browser.
- For each file in the ZIP, create a blob URL and call `updateEntry(index, { processedUrl, processedSize, status: 'completed' })`.
- Match ZIP entries to store entries **by index/order** (the batch endpoint processes files in submission order, and `archiver` appends results in completion order via p-queue — but since we use `concurrency: 1` equivalent ordering, or we can sort by original filename). To be safe, the batch endpoint will include an `X-File-Order` response header listing original filenames in order, so the client can map ZIP entries back to store entries even if `getUniqueName()` renamed duplicates.
- **Important**: per-file `status` updates to `'completed'` happen via SSE during processing (for progress UI), but `processedUrl` is only populated after the full ZIP is downloaded and extracted. The UI shows a checkmark on the thumbnail as soon as SSE reports completion, but the before/after preview for that image becomes available only after ZIP extraction.

**Single-file processing**: Keep existing `processFiles()` method unchanged for tools that only work with one file (compare, collage, etc.).

### 4. Tool Page (`tool-page.tsx`)

**Changes to left panel**:
- `FileSelectionInfo` replaced with richer file summary:
  - Shows "Files (N)" with count.
  - "+ Add more" link that opens file picker (calls `addFiles`).
  - Currently selected filename + size.
  - "Clear all" to reset.
- Process button text changes: "Process All (N files)" when N > 1, "Process" when N = 1.

**Changes to main area**:
- Replace direct `ImageViewer` usage with `MultiImageViewer`.
- `MultiImageViewer` handles all states: single image, multiple images, pre-process, post-process.
- When processed and multiple files: arrows navigate between before/after results per image.

**Download section in left panel (post-processing)**:
- "Download This" — downloads current file's processed result (uses `processedUrl` from the entry).
- "Download All (ZIP)" — creates a download link from `batchZipBlob` stored in the file store. No re-request needed.
- Per-file stats: "2.4 MB → 2.1 MB (−300 KB)".
- Overall stats: "Processed: 5/5, Total saved: 1.2 MB".

### 5. Strip Metadata Enhancement

#### Backend: Existing `/inspect` endpoint

The strip-metadata tool already has a `POST /api/v1/tools/strip-metadata/inspect` endpoint that returns parsed EXIF, GPS, ICC, and XMP metadata. The frontend already calls this endpoint and displays the results in collapsible sections with a GPS privacy warning. **No new backend endpoint is needed.**

The existing response shape:
```typescript
interface MetadataResult {
  filename: string;
  fileSize: number;
  exif?: Record<string, unknown> | null;
  exifError?: string;
  gps?: Record<string, unknown> | null;
  icc?: Record<string, string> | null;
  xmp?: Record<string, string> | null;
}
```

This already works. The only change needed is making the metadata display **multi-file aware**.

#### Frontend: `StripMetadataSettings` changes for multi-file

The existing metadata auto-fetch logic fetches metadata for `files[0]`. Change it to:
- Fetch metadata for `entries[selectedIndex].file` instead of `files[0]`.
- Cache metadata per-file to avoid re-fetching when navigating between images (use a `Map<string, MetadataResult>` keyed by file identity).
- When the user navigates to a different image via the filmstrip, the metadata panel updates to show that image's metadata.
- The strip options and "Process All" button apply to all files uniformly.

### 6. Batch Endpoint Change (`batch.ts`)

One small backend change: accept `clientJobId` from the multipart form and use it as the job ID.

```typescript
// In the multipart parsing loop, add:
} else if (part.fieldname === "clientJobId") {
  clientJobId = part.value as string;
}

// Then use it:
const jobId = clientJobId || randomUUID();
```

This lets the client open the SSE connection before upload completes, enabling real-time progress tracking for batch operations.

### 7. Dropzone Changes

**"+ Add more" support**: New `addFiles()` action in store. The dropzone on the tool page is replaced by the image viewer after upload, but a small "+ Add more" link in the left panel opens a file picker dialog (reuses the same `input.click()` pattern from the existing dropzone).

**No dropzone changes needed for the main drop area**: The existing dropzone handles multi-file upload correctly. After files are uploaded, it's replaced by `MultiImageViewer`.

### 8. Docker Build

Update the local Docker build to ensure the UI changes are testable:
- No new system dependencies needed (`fflate` is pure JS).
- Ensure `pnpm install` picks up new deps and frontend builds correctly.

## New Dependencies

- `fflate` — Lightweight ZIP decompression in the browser. Pure JS. Added to `apps/web`.

## Files Changed

### New files:
- `apps/web/src/components/common/multi-image-viewer.tsx` — Wrapper with filmstrip + arrows
- `apps/web/src/components/common/thumbnail-strip.tsx` — Horizontal thumbnail filmstrip

### Modified files:
- `apps/web/src/stores/file-store.ts` — Multi-file state with per-file tracking
- `apps/web/src/hooks/use-tool-processor.ts` — Add `processAllFiles` batch method
- `apps/web/src/pages/tool-page.tsx` — Use `MultiImageViewer`, update left panel
- `apps/web/src/components/tools/strip-metadata-settings.tsx` — Multi-file metadata display
- `apps/api/src/routes/batch.ts` — Accept `clientJobId` from multipart

## Out of Scope

- Per-file different settings (all files get same settings in batch mode).
- Drag-to-reorder files in the filmstrip.
- Pipeline/chaining multiple tools on batch results.
- Mobile-specific filmstrip optimizations (will use same horizontal scroll, works fine on touch).
