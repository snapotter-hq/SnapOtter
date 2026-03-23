# Multi-Image UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul multi-image upload UX with filmstrip navigation, batch processing, per-file results with ZIP download, and rich metadata display for strip-metadata.

**Architecture:** Evolve file-store from single-file to per-entry tracking (`FileEntry[]` + `selectedIndex`). Wrap existing `ImageViewer` in a new `MultiImageViewer` with bottom filmstrip + arrow navigation. Add `processAllFiles` to `useToolProcessor` using fetch + fflate for ZIP extraction. Backend: add `clientJobId` support to batch route.

**Tech Stack:** React 19, Zustand 5, Vite, Fastify, Sharp, fflate (ZIP), Vitest, Tailwind 4

**Spec:** `docs/superpowers/specs/2026-03-23-multi-image-ux-design.md`

---

## File Structure

### New files:
| File | Responsibility |
|------|---------------|
| `apps/web/src/components/common/multi-image-viewer.tsx` | Wrapper: arrows, counter, filmstrip, delegates to ImageViewer/BeforeAfterSlider |
| `apps/web/src/components/common/thumbnail-strip.tsx` | Horizontal filmstrip with thumbnails, selection highlight, status badges |

### Modified files:
| File | Changes |
|------|---------|
| `apps/web/src/stores/file-store.ts` | Replace with FileEntry[] model, selectedIndex, batch state, navigation actions |
| `apps/web/src/hooks/use-tool-processor.ts` | Add `processAllFiles` using fetch + fflate ZIP extraction |
| `apps/web/src/pages/tool-page.tsx` | Use MultiImageViewer, update FileSelectionInfo, batch buttons, download section |
| `apps/web/src/components/tools/strip-metadata-settings.tsx` | Multi-file metadata: fetch per selected entry, cache results |
| `apps/api/src/routes/batch.ts` | Accept `clientJobId` from multipart, add `X-File-Order` header |
| `apps/web/package.json` | Add `fflate` dependency |
| `tests/unit/web/stores.test.ts` | Rewrite FileStore tests for new interface |

---

## Task 1: Install fflate dependency

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install fflate**

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image
pnpm add fflate --filter @stirling-image/web
```

- [ ] **Step 2: Verify installation**

```bash
pnpm ls fflate --filter @stirling-image/web
```

Expected: fflate version listed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add fflate for client-side ZIP extraction"
```

---

## Task 2: Rewrite file-store with FileEntry model

**Files:**
- Modify: `apps/web/src/stores/file-store.ts`
- Modify: `tests/unit/web/stores.test.ts`

The store is the foundation — everything else depends on it. The new interface replaces the flat state with a `FileEntry[]` array and `selectedIndex`.

- [ ] **Step 1: Write failing tests for new store interface**

Replace the `FileStore` describe block in `tests/unit/web/stores.test.ts`. Keep the existing test infrastructure (mocks, helpers, API lib tests). The new tests cover:

```typescript
// In tests/unit/web/stores.test.ts, replace the FileStore describe block:

describe("FileStore", () => {
  beforeEach(() => {
    useFileStore.getState().reset();
    vi.clearAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  // -- Initial state
  it("has correct initial state", () => {
    const s = useFileStore.getState();
    expect(s.entries).toEqual([]);
    expect(s.selectedIndex).toBe(0);
    expect(s.batchZipBlob).toBeNull();
    expect(s.batchZipFilename).toBeNull();
    expect(s.processing).toBe(false);
    expect(s.error).toBeNull();
  });

  // -- setFiles
  it("setFiles creates FileEntry for each file with blob URLs", () => {
    createObjectURL
      .mockReturnValueOnce("blob:url-1")
      .mockReturnValueOnce("blob:url-2");

    const f1 = makeFile("a.png", 100);
    const f2 = makeFile("b.png", 200);
    useFileStore.getState().setFiles([f1, f2]);

    const s = useFileStore.getState();
    expect(s.entries).toHaveLength(2);
    expect(s.entries[0].file).toBe(f1);
    expect(s.entries[0].blobUrl).toBe("blob:url-1");
    expect(s.entries[0].originalSize).toBe(100);
    expect(s.entries[0].status).toBe("pending");
    expect(s.entries[0].processedUrl).toBeNull();
    expect(s.entries[1].file).toBe(f2);
    expect(s.entries[1].blobUrl).toBe("blob:url-2");
    expect(s.selectedIndex).toBe(0);
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("setFiles revokes all previous blob URLs", () => {
    createObjectURL
      .mockReturnValueOnce("blob:old-1")
      .mockReturnValueOnce("blob:old-2")
      .mockReturnValueOnce("blob:new-1");

    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    revokeObjectURL.mockClear();

    useFileStore.getState().setFiles([makeFile("c.png")]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:old-1");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:old-2");
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("setFiles with empty array clears entries", () => {
    createObjectURL.mockReturnValueOnce("blob:x");
    useFileStore.getState().setFiles([makeFile("x.png")]);
    revokeObjectURL.mockClear();

    useFileStore.getState().setFiles([]);
    expect(useFileStore.getState().entries).toEqual([]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("setFiles resets selectedIndex to 0", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);
    expect(useFileStore.getState().selectedIndex).toBe(1);

    useFileStore.getState().setFiles([makeFile("c.png")]);
    expect(useFileStore.getState().selectedIndex).toBe(0);
  });

  it("setFiles clears error", () => {
    useFileStore.getState().setError("old");
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png")]);
    expect(useFileStore.getState().error).toBeNull();
  });

  // -- addFiles
  it("addFiles appends to existing entries", () => {
    createObjectURL
      .mockReturnValueOnce("blob:1")
      .mockReturnValueOnce("blob:2");

    useFileStore.getState().setFiles([makeFile("a.png", 100)]);
    useFileStore.getState().addFiles([makeFile("b.png", 200)]);

    const s = useFileStore.getState();
    expect(s.entries).toHaveLength(2);
    expect(s.entries[0].file.name).toBe("a.png");
    expect(s.entries[1].file.name).toBe("b.png");
  });

  it("addFiles does not change selectedIndex", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setSelectedIndex(0);
    useFileStore.getState().addFiles([makeFile("b.png")]);
    expect(useFileStore.getState().selectedIndex).toBe(0);
  });

  // -- removeFile
  it("removeFile removes entry and revokes its blob URL", () => {
    createObjectURL
      .mockReturnValueOnce("blob:1")
      .mockReturnValueOnce("blob:2");
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    revokeObjectURL.mockClear();

    useFileStore.getState().removeFile(0);
    expect(useFileStore.getState().entries).toHaveLength(1);
    expect(useFileStore.getState().entries[0].file.name).toBe("b.png");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("removeFile adjusts selectedIndex if needed", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);
    useFileStore.getState().setSelectedIndex(2);
    useFileStore.getState().removeFile(2);
    expect(useFileStore.getState().selectedIndex).toBe(1);
  });

  // -- Navigation
  it("navigateNext increments selectedIndex", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().navigateNext();
    expect(useFileStore.getState().selectedIndex).toBe(1);
  });

  it("navigateNext does not go past last entry", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().navigateNext();
    useFileStore.getState().navigateNext();
    expect(useFileStore.getState().selectedIndex).toBe(1);
  });

  it("navigatePrev decrements selectedIndex", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);
    useFileStore.getState().navigatePrev();
    expect(useFileStore.getState().selectedIndex).toBe(0);
  });

  it("navigatePrev does not go below 0", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().navigatePrev();
    expect(useFileStore.getState().selectedIndex).toBe(0);
  });

  // -- updateEntry
  it("updateEntry updates specific fields of an entry", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png", 1000)]);
    useFileStore.getState().updateEntry(0, {
      processedUrl: "blob:processed",
      processedSize: 800,
      status: "completed",
    });

    const entry = useFileStore.getState().entries[0];
    expect(entry.processedUrl).toBe("blob:processed");
    expect(entry.processedSize).toBe(800);
    expect(entry.status).toBe("completed");
    expect(entry.file.name).toBe("a.png"); // unchanged
  });

  it("updateEntry with out-of-bounds index is a no-op", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().updateEntry(5, { status: "completed" });
    expect(useFileStore.getState().entries[0].status).toBe("pending");
  });

  // -- setBatchZip
  it("setBatchZip stores blob and filename", () => {
    const blob = new Blob(["zip-data"]);
    useFileStore.getState().setBatchZip(blob, "batch-results.zip");
    expect(useFileStore.getState().batchZipBlob).toBe(blob);
    expect(useFileStore.getState().batchZipFilename).toBe("batch-results.zip");
  });

  // -- undoProcessing
  it("undoProcessing resets all entries to pending and clears batch zip", () => {
    createObjectURL
      .mockReturnValueOnce("blob:orig-1")
      .mockReturnValueOnce("blob:orig-2");

    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().updateEntry(0, {
      processedUrl: "blob:proc-1",
      processedSize: 500,
      status: "completed",
    });
    useFileStore.getState().updateEntry(1, {
      processedUrl: "blob:proc-2",
      processedSize: 600,
      status: "completed",
    });
    useFileStore.getState().setBatchZip(new Blob(), "test.zip");
    revokeObjectURL.mockClear();

    useFileStore.getState().undoProcessing();

    const s = useFileStore.getState();
    expect(s.entries[0].status).toBe("pending");
    expect(s.entries[0].processedUrl).toBeNull();
    expect(s.entries[0].processedSize).toBeNull();
    expect(s.entries[0].error).toBeNull();
    expect(s.entries[1].status).toBe("pending");
    expect(s.entries[1].processedUrl).toBeNull();
    expect(s.batchZipBlob).toBeNull();
    expect(s.batchZipFilename).toBeNull();
    // Should revoke processed blob URLs
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:proc-1");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:proc-2");
    // Should NOT revoke original blob URLs
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:orig-1");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:orig-2");
  });

  it("undoProcessing keeps files and selectedIndex", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);
    useFileStore.getState().undoProcessing();
    expect(useFileStore.getState().entries).toHaveLength(2);
    expect(useFileStore.getState().selectedIndex).toBe(1);
  });

  // -- reset
  it("reset clears everything and revokes all blob URLs", () => {
    createObjectURL
      .mockReturnValueOnce("blob:orig")
      .mockReturnValueOnce("blob:orig-2");

    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:proc" });
    revokeObjectURL.mockClear();

    useFileStore.getState().reset();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:orig");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:orig-2");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:proc");

    const s = useFileStore.getState();
    expect(s.entries).toEqual([]);
    expect(s.selectedIndex).toBe(0);
    expect(s.batchZipBlob).toBeNull();
    expect(s.processing).toBe(false);
    expect(s.error).toBeNull();
  });

  // -- Backward compat helpers
  it("exposes files getter that returns File[] from entries", () => {
    createObjectURL.mockReturnValue("blob:x");
    const f1 = makeFile("a.png");
    const f2 = makeFile("b.png");
    useFileStore.getState().setFiles([f1, f2]);
    expect(useFileStore.getState().files).toEqual([f1, f2]);
  });

  it("exposes currentEntry getter", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);
    expect(useFileStore.getState().currentEntry?.file.name).toBe("b.png");
  });

  it("currentEntry is null when no entries", () => {
    expect(useFileStore.getState().currentEntry).toBeNull();
  });

  it("exposes selectedFileName from current entry", () => {
    createObjectURL.mockReturnValue("blob:x");
    useFileStore.getState().setFiles([makeFile("photo.png", 2048)]);
    expect(useFileStore.getState().selectedFileName).toBe("photo.png");
    expect(useFileStore.getState().selectedFileSize).toBe(2048);
  });

  it("exposes originalBlobUrl from current entry", () => {
    createObjectURL.mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    expect(useFileStore.getState().originalBlobUrl).toBe("blob:first");
    useFileStore.getState().setSelectedIndex(1);
    expect(useFileStore.getState().originalBlobUrl).toBe("blob:second");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:unit tests/unit/web/stores.test.ts
```

Expected: FileStore tests fail (old interface doesn't match new tests).

- [ ] **Step 3: Implement the new file store**

Rewrite `apps/web/src/stores/file-store.ts`:

```typescript
import { create } from "zustand";

export interface FileEntry {
  file: File;
  blobUrl: string;
  /** Server download URL (single-file) or client blob URL (batch/ZIP). */
  processedUrl: string | null;
  processedSize: number | null;
  originalSize: number;
  status: "pending" | "processing" | "completed" | "failed";
  error: string | null;
}

interface FileState {
  entries: FileEntry[];
  selectedIndex: number;
  batchZipBlob: Blob | null;
  batchZipFilename: string | null;
  processing: boolean;
  error: string | null;

  // Derived (computed as getters)
  readonly files: File[];
  readonly currentEntry: FileEntry | null;
  readonly hasFiles: boolean;
  readonly allProcessed: boolean;
  readonly selectedFileName: string | null;
  readonly selectedFileSize: number | null;
  readonly originalBlobUrl: string | null;
  readonly processedUrl: string | null;
  readonly originalSize: number | null;
  readonly processedSize: number | null;

  // Actions
  setFiles: (files: File[]) => void;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  setSelectedIndex: (index: number) => void;
  navigateNext: () => void;
  navigatePrev: () => void;
  updateEntry: (index: number, updates: Partial<FileEntry>) => void;
  setBatchZip: (blob: Blob, filename: string) => void;
  setProcessing: (v: boolean) => void;
  setError: (e: string | null) => void;
  setJobId: (id: string) => void;
  setProcessedUrl: (url: string | null) => void;
  setSizes: (original: number, processed: number) => void;
  undoProcessing: () => void;
  reset: () => void;
}

function createEntry(file: File): FileEntry {
  return {
    file,
    blobUrl: URL.createObjectURL(file),
    processedUrl: null,
    processedSize: null,
    originalSize: file.size,
    status: "pending",
    error: null,
  };
}

function revokeEntries(entries: FileEntry[]) {
  for (const entry of entries) {
    URL.revokeObjectURL(entry.blobUrl);
    if (entry.processedUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(entry.processedUrl);
    }
  }
}

export const useFileStore = create<FileState>((set, get) => ({
  entries: [],
  selectedIndex: 0,
  batchZipBlob: null,
  batchZipFilename: null,
  processing: false,
  error: null,

  // Derived getters — these are accessed via getState() or selectors
  get files() {
    return get().entries.map((e) => e.file);
  },
  get currentEntry() {
    const { entries, selectedIndex } = get();
    return entries[selectedIndex] ?? null;
  },
  get hasFiles() {
    return get().entries.length > 0;
  },
  get allProcessed() {
    const { entries } = get();
    return entries.length > 0 && entries.every((e) => e.status === "completed");
  },
  get selectedFileName() {
    return get().currentEntry?.file.name ?? null;
  },
  get selectedFileSize() {
    return get().currentEntry?.file.size ?? null;
  },
  get originalBlobUrl() {
    return get().currentEntry?.blobUrl ?? null;
  },
  get processedUrl() {
    return get().currentEntry?.processedUrl ?? null;
  },
  get originalSize() {
    return get().currentEntry?.originalSize ?? null;
  },
  get processedSize() {
    return get().currentEntry?.processedSize ?? null;
  },

  setFiles: (files) => {
    revokeEntries(get().entries);
    set({
      entries: files.map(createEntry),
      selectedIndex: 0,
      error: null,
      batchZipBlob: null,
      batchZipFilename: null,
    });
  },

  addFiles: (files) => {
    const newEntries = files.map(createEntry);
    set((state) => ({
      entries: [...state.entries, ...newEntries],
    }));
  },

  removeFile: (index) => {
    const { entries, selectedIndex } = get();
    if (index < 0 || index >= entries.length) return;
    const entry = entries[index];
    URL.revokeObjectURL(entry.blobUrl);
    if (entry.processedUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(entry.processedUrl);
    }
    const newEntries = entries.filter((_, i) => i !== index);
    const newIndex = selectedIndex >= newEntries.length
      ? Math.max(0, newEntries.length - 1)
      : selectedIndex;
    set({ entries: newEntries, selectedIndex: newIndex });
  },

  setSelectedIndex: (index) => {
    const { entries } = get();
    if (index >= 0 && index < entries.length) {
      set({ selectedIndex: index });
    }
  },

  navigateNext: () => {
    const { selectedIndex, entries } = get();
    if (selectedIndex < entries.length - 1) {
      set({ selectedIndex: selectedIndex + 1 });
    }
  },

  navigatePrev: () => {
    const { selectedIndex } = get();
    if (selectedIndex > 0) {
      set({ selectedIndex: selectedIndex - 1 });
    }
  },

  updateEntry: (index, updates) => {
    const { entries } = get();
    if (index < 0 || index >= entries.length) return;
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], ...updates };
    set({ entries: newEntries });
  },

  setBatchZip: (blob, filename) => {
    set({ batchZipBlob: blob, batchZipFilename: filename });
  },

  setProcessing: (v) => set({ processing: v }),
  setError: (e) => set({ error: e, processing: false }),
  setJobId: (_id) => {
    // Kept for backward compat — batch doesn't need a single jobId
  },
  setProcessedUrl: (url) => {
    // Backward compat: update current entry's processedUrl
    const { selectedIndex, entries } = get();
    if (entries.length === 0) return;
    const newEntries = [...entries];
    newEntries[selectedIndex] = { ...newEntries[selectedIndex], processedUrl: url, status: url ? "completed" : "pending" };
    set({ entries: newEntries });
  },
  setSizes: (original, processed) => {
    const { selectedIndex, entries } = get();
    if (entries.length === 0) return;
    const newEntries = [...entries];
    newEntries[selectedIndex] = { ...newEntries[selectedIndex], originalSize: original, processedSize: processed };
    set({ entries: newEntries });
  },

  undoProcessing: () => {
    const { entries } = get();
    for (const entry of entries) {
      if (entry.processedUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(entry.processedUrl);
      }
    }
    set({
      entries: entries.map((e) => ({
        ...e,
        processedUrl: null,
        processedSize: null,
        status: "pending" as const,
        error: null,
      })),
      batchZipBlob: null,
      batchZipFilename: null,
      error: null,
    });
  },

  reset: () => {
    revokeEntries(get().entries);
    set({
      entries: [],
      selectedIndex: 0,
      batchZipBlob: null,
      batchZipFilename: null,
      processing: false,
      error: null,
    });
  },
}));
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit tests/unit/web/stores.test.ts
```

Expected: All FileStore tests pass. API lib tests should still pass unchanged.

- [ ] **Step 5: Run typecheck to catch compile errors in consumers**

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image/apps/web && pnpm typecheck
```

Expected: Type errors in tool-page.tsx, strip-metadata-settings.tsx, and other files that reference old store fields (`jobId`, `originalBlobUrl` as direct state). These will be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/stores/file-store.ts tests/unit/web/stores.test.ts
git commit -m "feat: rewrite file-store with FileEntry model for multi-image support"
```

---

## Task 3: Build ThumbnailStrip component

**Files:**
- Create: `apps/web/src/components/common/thumbnail-strip.tsx`

- [ ] **Step 1: Create ThumbnailStrip component**

```typescript
// apps/web/src/components/common/thumbnail-strip.tsx
import { useRef, useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { FileEntry } from "@/stores/file-store";

interface ThumbnailStripProps {
  entries: FileEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function ThumbnailStrip({ entries, selectedIndex, onSelect }: ThumbnailStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to keep selected thumbnail visible
  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [selectedIndex]);

  if (entries.length <= 1) return null;

  return (
    <div
      ref={containerRef}
      className="flex gap-1.5 px-3 py-2 overflow-x-auto border-t border-border bg-muted/30"
      style={{ scrollBehavior: "smooth" }}
    >
      {entries.map((entry, i) => {
        const isSelected = i === selectedIndex;
        const isCompleted = entry.status === "completed";
        const isFailed = entry.status === "failed";

        return (
          <button
            key={`${entry.file.name}-${i}`}
            ref={isSelected ? selectedRef : undefined}
            onClick={() => onSelect(i)}
            className={`relative shrink-0 rounded overflow-hidden transition-all ${
              isSelected
                ? "outline outline-2 outline-primary outline-offset-1"
                : "hover:outline hover:outline-1 hover:outline-border"
            }`}
            style={{ width: 52, height: 38 }}
            title={entry.file.name}
          >
            <img
              src={entry.processedUrl ?? entry.blobUrl}
              alt={entry.file.name}
              className="w-full h-full object-cover"
              draggable={false}
            />
            {isCompleted && (
              <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-2.5 w-2.5 text-white" />
              </div>
            )}
            {isFailed && (
              <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center">
                <XCircle className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image/apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -5
```

Note: There will be errors from other files referencing the old store — that's expected. The new file itself should not have errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/thumbnail-strip.tsx
git commit -m "feat: add ThumbnailStrip filmstrip component"
```

---

## Task 4: Build MultiImageViewer component

**Files:**
- Create: `apps/web/src/components/common/multi-image-viewer.tsx`

- [ ] **Step 1: Create MultiImageViewer component**

```typescript
// apps/web/src/components/common/multi-image-viewer.tsx
import { useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ImageViewer } from "@/components/common/image-viewer";
import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { ThumbnailStrip } from "@/components/common/thumbnail-strip";
import { useFileStore } from "@/stores/file-store";

export function MultiImageViewer() {
  const {
    entries,
    selectedIndex,
    setSelectedIndex,
    navigateNext,
    navigatePrev,
  } = useFileStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const currentEntry = entries[selectedIndex];
  if (!currentEntry) return null;

  const hasMultiple = entries.length > 1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < entries.length - 1;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigatePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateNext();
      }
    },
    [navigateNext, navigatePrev],
  );

  const hasProcessed = !!currentEntry.processedUrl;

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full"
      onKeyDown={hasMultiple ? handleKeyDown : undefined}
      tabIndex={hasMultiple ? 0 : undefined}
    >
      {/* Main viewer with navigation arrows */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* Left arrow */}
        {hasMultiple && hasPrev && (
          <button
            onClick={navigatePrev}
            className="absolute left-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Image or Before/After */}
        <div className="w-full h-full">
          {hasProcessed ? (
            <BeforeAfterSlider
              beforeSrc={currentEntry.blobUrl}
              afterSrc={currentEntry.processedUrl!}
              beforeSize={currentEntry.originalSize}
              afterSize={currentEntry.processedSize ?? undefined}
            />
          ) : (
            <ImageViewer
              src={currentEntry.blobUrl}
              filename={currentEntry.file.name}
              fileSize={currentEntry.file.size}
            />
          )}
        </div>

        {/* Right arrow */}
        {hasMultiple && hasNext && (
          <button
            onClick={navigateNext}
            className="absolute right-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Counter badge */}
        {hasMultiple && (
          <div className="absolute top-3 right-3 z-10 bg-background/80 border border-border px-2 py-0.5 rounded-full text-xs text-muted-foreground tabular-nums">
            {selectedIndex + 1} / {entries.length}
          </div>
        )}
      </div>

      {/* Thumbnail filmstrip */}
      <ThumbnailStrip
        entries={entries}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/common/multi-image-viewer.tsx
git commit -m "feat: add MultiImageViewer with arrow navigation and filmstrip"
```

---

## Task 5: Update tool-page.tsx to use new store and MultiImageViewer

**Files:**
- Modify: `apps/web/src/pages/tool-page.tsx`

This is the integration point — the tool page needs to use the new store interface, render `MultiImageViewer`, and show updated file info + download buttons.

- [ ] **Step 1: Update tool-page.tsx**

Key changes:
1. Import `MultiImageViewer` instead of directly using `ImageViewer`/`BeforeAfterSlider`.
2. Update `FileSelectionInfo` to show file count, "+ Add more", and current file info from entries.
3. Use `entries` and `currentEntry` from store instead of `files[0]`.
4. Change process button to "Process All (N files)" when N > 1.
5. Add "Download This" + "Download All (ZIP)" buttons post-processing.
6. Add an "+ Add more" handler that opens a file picker.

The full implementation:

In `FileSelectionInfo`, replace the component to show:
- "Files (N)" header with count
- "+ Add more" link
- Current file name and size (from `currentEntry`)
- "Clear all" button

In the main area, replace the `ImageViewer`/`BeforeAfterSlider` conditionals with a single `<MultiImageViewer />` when `hasFile`.

In the review panel area, add batch download buttons when `entries.length > 1`:
- "Download This" — uses `currentEntry.processedUrl`
- "Download All (ZIP)" — uses `batchZipBlob` from store

Update the import list: add `MultiImageViewer`, remove direct `ImageViewer` and `BeforeAfterSlider` imports (they're now used internally by `MultiImageViewer`).

The `handleFiles` callback stays the same (calls `reset()` then `setFiles()`).

Add a new `handleAddMore` callback:
```typescript
const handleAddMore = useCallback(() => {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = "image/*";
  input.onchange = (e) => {
    const newFiles = Array.from((e.target as HTMLInputElement).files || []);
    if (newFiles.length > 0) addFiles(newFiles);
  };
  input.click();
}, [addFiles]);
```

For "Download All (ZIP)": when `batchZipBlob` exists, create a download link:
```typescript
const handleDownloadAll = useCallback(() => {
  if (!batchZipBlob) return;
  const url = URL.createObjectURL(batchZipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = batchZipFilename ?? "processed-images.zip";
  a.click();
  URL.revokeObjectURL(url);
}, [batchZipBlob, batchZipFilename]);
```

- [ ] **Step 2: Fix type errors and verify build**

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image/apps/web && pnpm typecheck
```

Fix any remaining type errors. The main ones will be:
- `originalBlobUrl` — now a getter on the store, works the same way.
- `processedUrl` — now a getter returning current entry's processedUrl.
- `originalSize` / `processedSize` — now getters.
- `jobId` — `setJobId` is still available but is a no-op for batch.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/tool-page.tsx
git commit -m "feat: integrate MultiImageViewer and multi-file UX into tool page"
```

---

## Task 6: Update all tool settings components for new store interface

**Files:**
- Modify: All `apps/web/src/components/tools/*-settings.tsx` files

The store's getter-based backward compat (`files`, `processedUrl`, `originalSize`, `processedSize`, `selectedFileName`, `selectedFileSize`, `originalBlobUrl`) should handle most cases. But the individual settings components need to be checked.

- [ ] **Step 1: Audit and fix all settings components**

For each settings component that uses `useFileStore`:
- `files` — now a getter, returns `File[]` from entries. Should work unchanged.
- `processFiles(files, settings)` — the tool processor still takes `File[]`. For single-file tools, pass `files` (it uses `files[0]`). Works unchanged.
- `downloadUrl` — from `useToolProcessor`, still returns the processedUrl. Works unchanged.
- `originalSize` / `processedSize` — now getters. Works unchanged.

Most settings components should work without changes. Run typecheck to confirm:

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image/apps/web && pnpm typecheck
```

Fix any type errors found.

- [ ] **Step 2: Commit any fixes**

```bash
git add apps/web/src/components/tools/
git commit -m "fix: update tool settings for new file store interface"
```

---

## Task 7: Update strip-metadata-settings for multi-file metadata

**Files:**
- Modify: `apps/web/src/components/tools/strip-metadata-settings.tsx`

- [ ] **Step 1: Update metadata fetching to use selectedIndex**

Change the `useEffect` that auto-fetches metadata:
- Instead of `files[0]`, use `entries[selectedIndex].file`.
- Add a `Map<string, MetadataResult>` cache (keyed by `${file.name}-${file.size}-${file.lastModified}`) to avoid re-fetching when navigating between images.
- Listen to `selectedIndex` changes to update the displayed metadata.

```typescript
// Key changes in the component:
const { entries, selectedIndex, files } = useFileStore();

// Cache metadata per file to avoid re-fetching
const [metadataCache, setMetadataCache] = useState<Map<string, MetadataResult>>(new Map());
const [metadata, setMetadata] = useState<MetadataResult | null>(null);

const currentFile = entries[selectedIndex]?.file ?? null;
const fileKey = currentFile ? `${currentFile.name}-${currentFile.size}-${currentFile.lastModified}` : null;

useEffect(() => {
  if (!currentFile || !fileKey) {
    setMetadata(null);
    return;
  }

  // Check cache first
  const cached = metadataCache.get(fileKey);
  if (cached) {
    setMetadata(cached);
    return;
  }

  // Fetch metadata for this file
  const controller = new AbortController();
  (async () => {
    setInspecting(true);
    setInspectError(null);
    setMetadata(null);
    try {
      const formData = new FormData();
      formData.append("file", currentFile);
      const res = await fetch("/api/v1/tools/strip-metadata/inspect", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }
      const data: MetadataResult = await res.json();
      setMetadata(data);
      setMetadataCache((prev) => new Map(prev).set(fileKey, data));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setInspectError(err instanceof Error ? err.message : "Failed to inspect");
    } finally {
      setInspecting(false);
    }
  })();

  return () => controller.abort();
}, [currentFile, fileKey]);
```

- [ ] **Step 2: Verify the component works**

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image/apps/web && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/tools/strip-metadata-settings.tsx
git commit -m "feat: multi-file metadata display with per-file caching"
```

---

## Task 8: Add clientJobId support to batch endpoint

**Files:**
- Modify: `apps/api/src/routes/batch.ts`

- [ ] **Step 1: Update batch.ts multipart parsing**

In the multipart parsing loop (around line 61 in `batch.ts`), add a case for `clientJobId`:

```typescript
// Add this variable before the parsing loop:
let clientJobId: string | null = null;

// In the parsing loop, add this branch:
} else if (part.fieldname === "clientJobId") {
  clientJobId = part.value as string;
}
```

Then change the job ID generation (around line 105):

```typescript
const jobId = clientJobId || randomUUID();
```

Also add the `X-File-Order` response header after processing (before `archive.finalize()`). This lists original filenames in submission order so the client can match ZIP entries to store entries:

```typescript
// After the writeHead call, before archive operations, add to headers:
// Actually, we need to add this after we know the filenames.
// Add after the processing loop, before archive.finalize():
reply.raw.setHeader("X-File-Order", files.map(f => f.filename).join(","));
```

Wait — we can't set headers after `writeHead`. Instead, include it in the initial `writeHead`:

```typescript
reply.raw.writeHead(200, {
  "Content-Type": "application/zip",
  "Content-Disposition": `attachment; filename="batch-${toolId}-${jobId.slice(0, 8)}.zip"`,
  "Transfer-Encoding": "chunked",
  "X-Job-Id": jobId,
  "X-File-Order": files.map(f => f.filename).join(","),
});
```

- [ ] **Step 2: Run existing tests**

```bash
pnpm test:integration
```

Expected: Existing tests pass (batch route changes are additive).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/batch.ts
git commit -m "feat: accept clientJobId in batch endpoint for SSE progress correlation"
```

---

## Task 9: Add processAllFiles to useToolProcessor

**Files:**
- Modify: `apps/web/src/hooks/use-tool-processor.ts`

- [ ] **Step 1: Add batch processing method**

Add a new `processAllFiles` method to the hook. This uses `fetch()` instead of XHR to read response headers immediately. Keep the existing `processFiles` method for single-file backward compat.

```typescript
// Add to the hook, alongside processFiles:

const processAllFiles = useCallback(
  async (files: File[], settings: Record<string, unknown>) => {
    if (files.length === 0) {
      setError("No files selected");
      return;
    }
    if (files.length === 1) {
      // For single file, use the existing single-file method
      processFiles(files, settings);
      return;
    }

    const { updateEntry, setBatchZip } = useFileStore.getState();

    setError(null);
    setProcessing(true);
    setProgress({ phase: "uploading", percent: 0, elapsed: 0 });

    const startTime = Date.now();
    elapsedRef.current = setInterval(() => {
      setProgress((prev) => ({
        ...prev,
        elapsed: Math.floor((Date.now() - startTime) / 1000),
      }));
    }, 1000);

    const clientJobId = crypto.randomUUID();

    // Open SSE before upload
    try {
      const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "batch") {
            const pct = data.totalFiles > 0
              ? 15 + (data.completedFiles / data.totalFiles) * 85
              : 15;
            setProgress((prev) => ({
              ...prev,
              phase: "processing",
              percent: pct,
              stage: data.currentFile
                ? `Processing ${data.currentFile} (${data.completedFiles}/${data.totalFiles})`
                : `Processing ${data.completedFiles}/${data.totalFiles}`,
            }));

            // Update per-file status via currentFile
            if (data.currentFile) {
              const entries = useFileStore.getState().entries;
              const idx = entries.findIndex((e) => e.file.name === data.currentFile);
              if (idx >= 0) {
                updateEntry(idx, { status: "processing" });
              }
            }

            // Mark completed files
            if (data.completedFiles > 0) {
              const entries = useFileStore.getState().entries;
              // Mark entries as completed based on count (SSE doesn't tell us which specific files completed)
              // We'll update processedUrl later after ZIP extraction
              for (let i = 0; i < Math.min(data.completedFiles, entries.length); i++) {
                if (entries[i].status === "processing") {
                  updateEntry(i, { status: "completed" });
                }
              }
            }
          }
        } catch {
          // Ignore malformed SSE
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
      };
    } catch {
      // SSE failed — proceed without real-time progress
    }

    // Build FormData
    const formData = new FormData();
    for (const file of files) {
      formData.append("file", file);
    }
    formData.append("settings", JSON.stringify(settings));
    formData.append("clientJobId", clientJobId);

    try {
      const token = localStorage.getItem("stirling-token") || "";
      const response = await fetch(`/api/v1/tools/${toolId}/batch`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      if (!response.ok) {
        const text = await response.text();
        let errorMsg: string;
        try {
          const body = JSON.parse(text);
          errorMsg = body.error || body.details || `Batch processing failed: ${response.status}`;
        } catch {
          errorMsg = `Batch processing failed: ${response.status}`;
        }
        setError(errorMsg);
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
        return;
      }

      // Get the ZIP blob
      const zipBlob = await response.blob();
      const filename = `batch-${toolId}.zip`;
      setBatchZip(zipBlob, filename);

      // Extract files from ZIP using fflate
      const { unzipSync } = await import("fflate");
      const zipBuffer = new Uint8Array(await zipBlob.arrayBuffer());
      const extracted = unzipSync(zipBuffer);

      // Get file order from response header
      const fileOrder = response.headers.get("X-File-Order")?.split(",") ?? [];

      // Match extracted files to store entries
      const entries = useFileStore.getState().entries;
      const extractedNames = Object.keys(extracted);

      for (let i = 0; i < entries.length; i++) {
        const originalName = entries[i].file.name;
        // Try to find by original order first, then by name match
        let zipName: string | undefined;
        if (fileOrder[i] && extracted[fileOrder[i]]) {
          zipName = fileOrder[i];
        } else {
          zipName = extractedNames.find((n) => n === originalName)
            ?? extractedNames[i];
        }

        if (zipName && extracted[zipName]) {
          const blob = new Blob([extracted[zipName]]);
          const blobUrl = URL.createObjectURL(blob);
          updateEntry(i, {
            processedUrl: blobUrl,
            processedSize: blob.size,
            status: "completed",
          });
        } else {
          updateEntry(i, {
            status: "failed",
            error: "File not found in batch results",
          });
        }
      }

      setProcessing(false);
      setProgress(IDLE_PROGRESS);
    } catch (err) {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setError(err instanceof Error ? err.message : "Batch processing failed");
      setProcessing(false);
      setProgress(IDLE_PROGRESS);
    }
  },
  [toolId, processFiles, setProcessing, setError],
);
```

Add `processAllFiles` to the hook's return value:

```typescript
return {
  processFiles,
  processAllFiles,
  processing,
  error,
  downloadUrl: processedUrl,
  originalSize,
  processedSize,
  progress,
};
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image/apps/web && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-tool-processor.ts
git commit -m "feat: add processAllFiles batch method to tool processor hook"
```

---

## Task 10: Wire up batch processing in tool settings components

**Files:**
- Modify: `apps/web/src/components/tools/strip-metadata-settings.tsx` (as example)
- Modify: Other settings components that should support batch

- [ ] **Step 1: Update strip-metadata-settings to use processAllFiles**

Change the `handleProcess` function:

```typescript
const { processFiles, processAllFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
  useToolProcessor("strip-metadata");

const handleProcess = () => {
  if (files.length > 1) {
    processAllFiles(files, { stripAll, stripExif, stripGps, stripIcc, stripXmp });
  } else {
    processFiles(files, { stripAll, stripExif, stripGps, stripIcc, stripXmp });
  }
};
```

Update the button text:

```typescript
<button type="submit" disabled={!hasFile || processing} className="...">
  {files.length > 1 ? `Strip Metadata (${files.length} files)` : "Strip Metadata"}
</button>
```

- [ ] **Step 2: Apply same pattern to other batch-compatible tools**

For each tool settings component that makes sense for batch processing (resize, compress, convert, rotate, strip-metadata, all color tools, watermark tools, border, favicon):
- Import `processAllFiles` from the hook.
- Use `processAllFiles` when `files.length > 1`, `processFiles` when `files.length === 1`.
- Update button text to show file count.

Tools that are inherently single-file or multi-file specific (compare, find-duplicates, collage, compose, split, image-to-pdf, bulk-rename) can keep using their existing logic.

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image/apps/web && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/tools/
git commit -m "feat: wire up batch processing across tool settings components"
```

---

## Task 11: Build and test locally with Docker

**Files:**
- No new files

- [ ] **Step 1: Build Docker image**

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image
docker compose -f docker/docker-compose.yml build
```

Expected: Build succeeds. fflate is pure JS — no native deps needed.

- [ ] **Step 2: Start the container**

```bash
docker compose -f docker/docker-compose.yml up -d
```

Expected: Container starts on port 1349.

- [ ] **Step 3: Manual testing checklist**

Open `http://localhost:1349` and test:

1. **Single image upload**: Upload 1 image → should work exactly as before (no filmstrip, no arrows).
2. **Multi image upload**: Upload 3+ images → filmstrip appears at bottom, arrows appear on sides, counter shows "1 / N".
3. **Navigation**: Click thumbnails to switch, click arrows, use keyboard left/right.
4. **Strip metadata**: Upload image with EXIF → metadata display shows parsed fields, GPS warning if present.
5. **Process single**: With 1 file, process → before/after slider works.
6. **Process batch**: With multiple files, click "Process All (N files)" → progress shows, thumbnails get checkmarks.
7. **Download**: After batch processing, "Download This" downloads current file, "Download All (ZIP)" downloads ZIP.
8. **Undo**: Click undo → all entries reset to pending, filmstrip loses checkmarks.
9. **Add more**: Click "+ Add more" → new files appended to filmstrip.
10. **Clear**: Click "Clear all" → everything resets.

- [ ] **Step 4: Stop container**

```bash
docker compose -f docker/docker-compose.yml down
```

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```

---

## Task 12: Run full test suite

**Files:**
- No new files

- [ ] **Step 1: Run unit tests**

```bash
pnpm test:unit
```

Expected: All tests pass.

- [ ] **Step 2: Run integration tests**

```bash
pnpm test:integration
```

Expected: All tests pass. The batch endpoint change (clientJobId) is backward compatible.

- [ ] **Step 3: Run typecheck across all packages**

```bash
pnpm typecheck
```

Expected: No type errors.
