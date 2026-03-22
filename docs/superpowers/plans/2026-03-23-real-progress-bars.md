# Real Progress Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all fake/missing progress indicators with real, honest progress bars backed by actual upload and server-side processing data.

**Architecture:** Frontend generates a client jobId and opens an SSE side-channel before uploading. Python AI scripts emit granular progress to stderr, which bridge.ts captures via spawn and forwards through the SSE system. A new ProgressCard component renders the unified progress state. Fast (Sharp-based) tools show real upload progress and an honest "Processing..." state.

**Tech Stack:** React 19, Fastify 5, SSE (Server-Sent Events), XMLHttpRequest (upload progress), Python stderr streaming, child_process.spawn

**Spec:** `docs/superpowers/specs/2026-03-22-real-progress-bars-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `apps/web/src/components/common/progress-card.tsx` | Card-style progress UI component |

### Modified Files — Backend
| File | Change |
|------|--------|
| `apps/api/src/routes/progress.ts` | Add `SingleFileProgress` type, `updateSingleFileProgress()` function, discriminated union |
| `packages/ai/src/bridge.ts` | Switch `execFile` → `spawn`, parse stderr progress JSON, venv fallback via error event |
| `packages/ai/src/background-removal.ts` | Accept `onProgress` callback, pass to bridge |
| `packages/ai/src/face-detection.ts` | Accept `onProgress` callback, pass to bridge |
| `packages/ai/src/upscaling.ts` | Accept `onProgress` callback, pass to bridge |
| `packages/ai/src/inpainting.ts` | Accept `onProgress` callback, pass to bridge |
| `packages/ai/src/ocr.ts` | Accept `onProgress` callback, pass to bridge |
| `packages/ai/python/remove_bg.py` | Replace `sys.stderr.write()` with `emit_progress()` JSON |
| `packages/ai/python/detect_faces.py` | Add `emit_progress()` calls |
| `packages/ai/python/upscale.py` | Add `emit_progress()` calls |
| `packages/ai/python/inpaint.py` | Add `emit_progress()` calls |
| `packages/ai/python/ocr.py` | Add `emit_progress()` calls |
| `apps/api/src/routes/tools/remove-background.ts` | Extract `clientJobId`, wire `onProgress` → SSE |
| `apps/api/src/routes/tools/upscale.ts` | Extract `clientJobId`, wire `onProgress` → SSE |
| `apps/api/src/routes/tools/blur-faces.ts` | Extract `clientJobId`, wire `onProgress` → SSE |
| `apps/api/src/routes/tools/erase-object.ts` | Extract `clientJobId`, wire `onProgress` → SSE |
| `apps/api/src/routes/tools/ocr.ts` | Extract `clientJobId`, wire `onProgress` → SSE |

### Modified Files — Frontend
| File | Change |
|------|--------|
| `apps/web/src/hooks/use-tool-processor.ts` | XHR upload progress, SSE for AI tools, progress state |
| 33 files in `apps/web/src/components/tools/` | Swap `AIProgressBar`/`Loader2` for `ProgressCard` |

### Deleted Files
| File | Reason |
|------|--------|
| `apps/web/src/components/common/ai-progress-bar.tsx` | Replaced by `ProgressCard` |

---

## Task 1: Extend SSE Progress System

**Files:**
- Modify: `apps/api/src/routes/progress.ts`

- [ ] **Step 1: Add SingleFileProgress type and update function**

Open `apps/api/src/routes/progress.ts`. Add the discriminated union types and a new `updateSingleFileProgress` function. The existing `JobProgress` becomes `BatchProgress` internally but we keep backward compatibility.

```typescript
// Add after the existing JobProgress interface (line 20):

export interface SingleFileProgress {
  jobId: string;
  type: "single";
  phase: "processing" | "complete" | "failed";
  stage?: string;
  percent: number;
  error?: string;
}

/**
 * Update progress for a single-file AI processing job.
 * Uses the same SSE listener infrastructure as batch progress.
 */
export function updateSingleFileProgress(
  progress: Omit<SingleFileProgress, "type">,
): void {
  const event: SingleFileProgress = { ...progress, type: "single" };
  const subs = listeners.get(progress.jobId);
  if (subs) {
    for (const cb of subs) {
      (cb as (data: unknown) => void)(event);
    }
    if (progress.phase === "complete" || progress.phase === "failed") {
      setTimeout(() => {
        listeners.delete(progress.jobId);
      }, 5000);
    }
  }
}
```

Export `SingleFileProgress` alongside `JobProgress`.

Also update the `listeners` map type to accept the union:
```typescript
const listeners = new Map<string, Set<(data: JobProgress | SingleFileProgress) => void>>();
```

And update the `sendEvent` parameter type in the SSE route handler to accept both:
```typescript
const sendEvent = (data: JobProgress | SingleFileProgress) => {
```

- [ ] **Step 2: Verify the API server still builds**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/progress.ts
git commit -m "feat(api): add SingleFileProgress type and SSE update function"
```

---

## Task 2: Rewrite bridge.ts to Stream Stderr Progress

**Files:**
- Modify: `packages/ai/src/bridge.ts`

- [ ] **Step 1: Add `runPythonWithProgress` using `spawn`**

Replace the entire contents of `packages/ai/src/bridge.ts` with:

```typescript
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_DIR = resolve(__dirname, "../python");

/** Try venv first, then system python. */
function getPythonPath(): string {
  const venvPath =
    process.env.PYTHON_VENV_PATH || resolve(__dirname, "../../../.venv");
  return `${venvPath}/bin/python3`;
}

/**
 * Extract a user-friendly error from a Python process error.
 * Python scripts print JSON to stderr/stdout on failure — try to parse it.
 */
function extractPythonError(error: unknown): string {
  if (error && typeof error === "object") {
    const execError = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    for (const output of [execError.stdout, execError.stderr]) {
      if (output) {
        try {
          const parsed = JSON.parse(output.trim());
          if (parsed.error) return parsed.error;
        } catch {
          const trimmed = output.trim();
          if (trimmed && !trimmed.startsWith("Traceback")) {
            return trimmed;
          }
        }
      }
    }
    if (execError.message) return execError.message;
  }
  return String(error);
}

export interface ProgressCallback {
  (percent: number, stage: string): void;
}

/**
 * Run a Python script with real-time progress streaming via stderr.
 * Falls back to system python3 if the venv is not available.
 *
 * Python scripts emit progress as JSON lines to stderr:
 *   {"progress": 50, "stage": "Processing..."}
 *
 * Non-JSON stderr lines are collected as error output (backward compatible).
 */
export function runPythonWithProgress(
  scriptName: string,
  args: string[],
  options: {
    onProgress?: ProgressCallback;
    timeout?: number;
  } = {},
): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = resolve(PYTHON_DIR, scriptName);
  const timeout = options.timeout ?? 300000;

  return new Promise((resolvePromise, rejectPromise) => {
    const trySpawn = (pythonBin: string, isFallback: boolean) => {
      const child = spawn(pythonBin, [scriptPath, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderrLines: string[] = [];
      let stderrBuffer = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeout);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
        const lines = stderrBuffer.split("\n");
        // Keep the last incomplete line in the buffer
        stderrBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Try to parse as progress JSON
          try {
            const parsed = JSON.parse(trimmed);
            if (
              typeof parsed.progress === "number" &&
              typeof parsed.stage === "string"
            ) {
              options.onProgress?.(parsed.progress, parsed.stage);
              continue; // Don't collect progress lines as error output
            }
          } catch {
            // Not JSON — collect as regular stderr
          }
          stderrLines.push(trimmed);
        }
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (err.code === "ENOENT" && !isFallback) {
          // Venv python not found — retry with system python3
          trySpawn("python3", true);
        } else {
          rejectPromise(new Error(extractPythonError(err)));
        }
      });

      child.on("close", (code) => {
        clearTimeout(timer);

        // Flush any remaining stderr buffer
        if (stderrBuffer.trim()) {
          stderrLines.push(stderrBuffer.trim());
        }

        if (timedOut) {
          rejectPromise(new Error("Python script timed out"));
          return;
        }

        const stderr = stderrLines.join("\n");

        if (code !== 0) {
          // Try to extract a meaningful error from stdout or stderr
          const errorText =
            extractPythonError({ stdout: stdout.trim(), stderr }) ||
            `Python script exited with code ${code}`;
          rejectPromise(new Error(errorText));
          return;
        }

        resolvePromise({ stdout: stdout.trim(), stderr });
      });
    };

    trySpawn(getPythonPath(), false);
  });
}

/**
 * Run a Python script from packages/ai/python/ with the given arguments.
 * Falls back to system python3 if the venv is not available.
 *
 * @deprecated Use runPythonWithProgress for new code. Kept for backward compatibility.
 */
export async function runPythonScript(
  scriptName: string,
  args: string[],
  timeoutMs = 300000,
): Promise<{ stdout: string; stderr: string }> {
  return runPythonWithProgress(scriptName, args, { timeout: timeoutMs });
}
```

This keeps `runPythonScript` as a thin wrapper over `runPythonWithProgress` so all existing callers continue to work without changes.

- [ ] **Step 2: Verify the ai package builds**

Run: `cd packages/ai && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/bridge.ts
git commit -m "feat(ai): rewrite bridge.ts to stream stderr progress via spawn"
```

---

## Task 3: Add Progress Emission to Python Scripts

**Files:**
- Modify: `packages/ai/python/remove_bg.py`
- Modify: `packages/ai/python/detect_faces.py`
- Modify: `packages/ai/python/upscale.py`
- Modify: `packages/ai/python/inpaint.py`
- Modify: `packages/ai/python/ocr.py`

- [ ] **Step 1: Update `remove_bg.py`**

Add `emit_progress` helper and replace existing `sys.stderr.write()` calls. Note: the `os.dup2(2, 1)` redirect sends library noise to stderr — this is fine because bridge.ts ignores non-JSON stderr lines.

Add at the top of the file (after imports):
```python
def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)
```

In `main()`, replace the two `sys.stderr.write` blocks:
- Replace `sys.stderr.write(f"Loading model: {model}\n")` / `sys.stderr.flush()` (lines 24-25) with:
  `emit_progress(10, "Loading model")`
- Replace `sys.stderr.write("Processing image...\n")` / `sys.stderr.flush()` (lines 29-30) with:
  `emit_progress(25, "Model loaded")`

Add new progress calls:
- Before `output_data = remove(...)` (line 37): `emit_progress(30, "Analyzing image")`
- After `remove()` completes (after the try/except block, ~line 45): `emit_progress(80, "Background removed")`
- Before `if bg_color` check (line 48): `emit_progress(85, "Compositing background")` (only if bg_color is set)
- Before `with open(output_path, "wb")` (line 62): `emit_progress(95, "Saving result")`

- [ ] **Step 2: Update `detect_faces.py`**

Add `emit_progress` helper at the top (after imports):
```python
def emit_progress(percent, stage):
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)
```

Add calls at these points in `main()`:
- Before `from PIL import Image` (line 15): `emit_progress(10, "Loading face detection model")`
- After MediaPipe imports succeed (line 22): `emit_progress(20, "Model ready")`
- Before `results = detector.process(img_array)` (line 29): `emit_progress(25, "Scanning for faces")`
- After detection, before the loop (line 32): `emit_progress(50, f"Found {len(results.detections or [])} faces")`
- Inside the face loop, after each blur (line 51): `emit_progress(50 + int((i + 1) / len(results.detections) * 40), f"Blurring face {i + 1} of {len(results.detections)}")` — add `enumerate` to the `for` loop
- Before `img.save(output_path)` (line 54): `emit_progress(95, "Saving result")`

- [ ] **Step 3: Update `upscale.py`**

Add `emit_progress` helper at the top (after imports):
```python
def emit_progress(percent, stage):
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)
```

Add calls:
- Before `from PIL import Image` (line 14): `emit_progress(10, "Loading upscale model")`
- Before Real-ESRGAN import attempt (line 21): `emit_progress(15, "Checking for Real-ESRGAN")`
- After `RealESRGANer` creation (line 38): `emit_progress(20, "Model ready")`
- Before `upsampler.enhance` (line 40): `emit_progress(25, "Upscaling image")`
- After `enhance` returns (line 41): `emit_progress(90, "Upscaling complete")`
- In the Lanczos fallback, before `img.resize` (line 46): `emit_progress(50, "Upscaling with Lanczos")`
- Before the final `print(json.dumps(...))` (line 50): `emit_progress(95, "Saving result")`

- [ ] **Step 4: Update `inpaint.py`**

Add `emit_progress` helper at the top (after imports):
```python
def emit_progress(percent, stage):
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)
```

Add calls:
- Before `from PIL import Image` (line 12): `emit_progress(10, "Loading inpainting model")`
- After LaMa imports succeed (line 17): `emit_progress(20, "Model loaded")`
- Before mask resize check (line 23): `emit_progress(25, "Analyzing mask")`
- Before `model_manager(...)` call (line 40): `emit_progress(40, "Inpainting region")`
- After result returns (line 41): `emit_progress(85, "Refining edges")`
- Before `Image.fromarray(result).save(...)` (line 41): `emit_progress(95, "Saving result")`

- [ ] **Step 5: Update `ocr.py`**

Add `emit_progress` helper at the top (after imports):
```python
def emit_progress(percent, stage):
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)
```

Add calls:
- At the start of the main try block (line 13): `emit_progress(10, "Loading OCR engine")`
- For PaddleOCR path, before `ocr.ocr(...)` (line 19): `emit_progress(30, "Analyzing text regions")`
- After `ocr.ocr(...)` returns (line 19): `emit_progress(70, "Extracting text")`
- For Tesseract path, before `subprocess.run(...)` (line 50): `emit_progress(30, "Running Tesseract")`
- After `subprocess.run(...)` returns (line 55): `emit_progress(70, "Extracting text")`
- Before the final `print(json.dumps(...))` calls: `emit_progress(95, "Formatting results")`

- [ ] **Step 6: Commit**

```bash
git add packages/ai/python/remove_bg.py packages/ai/python/detect_faces.py packages/ai/python/upscale.py packages/ai/python/inpaint.py packages/ai/python/ocr.py
git commit -m "feat(ai): add emit_progress() calls to all Python AI scripts"
```

---

## Task 4: Wire Progress Callbacks Through AI Wrappers

**Files:**
- Modify: `packages/ai/src/background-removal.ts`
- Modify: `packages/ai/src/face-detection.ts`
- Modify: `packages/ai/src/upscaling.ts`
- Modify: `packages/ai/src/inpainting.ts`
- Modify: `packages/ai/src/ocr.ts`

Each AI wrapper currently calls `runPythonScript()`. Change them to call `runPythonWithProgress()` and accept an optional `onProgress` callback.

- [ ] **Step 1: Update `background-removal.ts`**

Change import from `runPythonScript` to `runPythonWithProgress` and add `ProgressCallback` type import:
```typescript
import { runPythonWithProgress, type ProgressCallback } from "./bridge.js";
```

Add `onProgress` to the function signature:
```typescript
export async function removeBackground(
  inputBuffer: Buffer,
  outputDir: string,
  options: RemoveBackgroundOptions = {},
  onProgress?: ProgressCallback,
): Promise<Buffer> {
```

Replace the `runPythonScript` call (line 25-29):
```typescript
    const timeout = options.model?.startsWith("birefnet") ? 600000 : 300000;
    const { stdout } = await runPythonWithProgress("remove_bg.py", [
      inputPath,
      outputPath,
      JSON.stringify(options),
    ], { onProgress, timeout });
```

- [ ] **Step 2: Update `face-detection.ts`**

Same pattern. Change import, add `onProgress` parameter:
```typescript
import { runPythonWithProgress, type ProgressCallback } from "./bridge.js";
```

```typescript
export async function blurFaces(
  inputBuffer: Buffer,
  outputDir: string,
  options: BlurFacesOptions = {},
  onProgress?: ProgressCallback,
): Promise<BlurFacesResult> {
```

Replace `runPythonScript` call (line 32-36):
```typescript
  const { stdout } = await runPythonWithProgress("detect_faces.py", [
    inputPath,
    outputPath,
    JSON.stringify(options),
  ], { onProgress });
```

- [ ] **Step 3: Update `upscaling.ts`**

Same pattern:
```typescript
import { runPythonWithProgress, type ProgressCallback } from "./bridge.js";
```

```typescript
export async function upscale(
  inputBuffer: Buffer,
  outputDir: string,
  options: UpscaleOptions = {},
  onProgress?: ProgressCallback,
): Promise<UpscaleResult> {
```

Replace `runPythonScript` call (line 25-29):
```typescript
  const { stdout } = await runPythonWithProgress("upscale.py", [
    inputPath,
    outputPath,
    JSON.stringify(options),
  ], { onProgress });
```

- [ ] **Step 4: Update `inpainting.ts`**

Same pattern:
```typescript
import { runPythonWithProgress, type ProgressCallback } from "./bridge.js";
```

```typescript
export async function inpaint(
  inputBuffer: Buffer,
  maskBuffer: Buffer,
  outputDir: string,
  onProgress?: ProgressCallback,
): Promise<Buffer> {
```

Replace `runPythonScript` call (line 17-21):
```typescript
  const { stdout } = await runPythonWithProgress("inpaint.py", [
    inputPath,
    maskPath,
    outputPath,
  ], { onProgress });
```

- [ ] **Step 5: Update `ocr.ts`**

Same pattern:
```typescript
import { runPythonWithProgress, type ProgressCallback } from "./bridge.js";
```

```typescript
export async function extractText(
  inputBuffer: Buffer,
  outputDir: string,
  options: OcrOptions = {},
  onProgress?: ProgressCallback,
): Promise<OcrResult> {
```

Replace `runPythonScript` call (line 23-26):
```typescript
  const { stdout } = await runPythonWithProgress("ocr.py", [
    inputPath,
    JSON.stringify(options),
  ], { onProgress });
```

- [ ] **Step 6: Export `ProgressCallback` from index.ts**

Add to `packages/ai/src/index.ts`:
```typescript
export { runPythonWithProgress } from "./bridge.js";
export type { ProgressCallback } from "./bridge.js";
```

(Keep the existing `runPythonScript` export too.)

- [ ] **Step 7: Verify the ai package builds**

Run: `cd packages/ai && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 8: Commit**

```bash
git add packages/ai/src/background-removal.ts packages/ai/src/face-detection.ts packages/ai/src/upscaling.ts packages/ai/src/inpainting.ts packages/ai/src/ocr.ts packages/ai/src/index.ts
git commit -m "feat(ai): add onProgress callback to all AI wrapper functions"
```

---

## Task 5: Wire AI Route Handlers to SSE Progress

**Files:**
- Modify: `apps/api/src/routes/tools/remove-background.ts`
- Modify: `apps/api/src/routes/tools/upscale.ts`
- Modify: `apps/api/src/routes/tools/blur-faces.ts`
- Modify: `apps/api/src/routes/tools/erase-object.ts`
- Modify: `apps/api/src/routes/tools/ocr.ts`

Each route handler needs to: (1) extract `clientJobId` from the multipart form, (2) create an `onProgress` callback that calls `updateSingleFileProgress`, (3) pass it to the AI wrapper.

- [ ] **Step 1: Update `remove-background.ts`**

Add import:
```typescript
import { updateSingleFileProgress } from "../progress.js";
```

In the multipart parsing loop (line 20-33), add a case for `clientJobId`:
```typescript
          } else if (part.fieldname === "settings") {
            settingsRaw = part.value as string;
          } else if (part.fieldname === "clientJobId") {
            clientJobId = part.value as string;
          }
```

Declare `let clientJobId: string | null = null;` alongside the other variables (line 16-18).

Create the progress callback before calling `removeBackground` (around line 55):
```typescript
        const onProgress = clientJobId
          ? (percent: number, stage: string) => {
              updateSingleFileProgress({
                jobId: clientJobId!,
                phase: "processing",
                stage,
                percent,
              });
            }
          : undefined;
```

Pass it to `removeBackground` (line 55-58):
```typescript
        const resultBuffer = await removeBackground(
          fileBuffer,
          join(workspacePath, "output"),
          { model: settings.model, backgroundColor: settings.backgroundColor },
          onProgress,
        );
```

After processing completes, emit completion:
```typescript
        if (clientJobId) {
          updateSingleFileProgress({
            jobId: clientJobId,
            phase: "complete",
            percent: 100,
          });
        }
```

- [ ] **Step 2: Update `upscale.ts`**

Same pattern as above. Add `updateSingleFileProgress` import, extract `clientJobId` from multipart, create callback, pass to `upscale()`:

```typescript
        const onProgress = clientJobId
          ? (percent: number, stage: string) => {
              updateSingleFileProgress({
                jobId: clientJobId!,
                phase: "processing",
                stage,
                percent,
              });
            }
          : undefined;

        const result = await upscale(
          fileBuffer,
          join(workspacePath, "output"),
          { scale },
          onProgress,
        );
```

- [ ] **Step 3: Update `blur-faces.ts`**

Same pattern. Pass callback to `blurFaces()`:

```typescript
        const result = await blurFaces(
          fileBuffer,
          join(workspacePath, "output"),
          {
            blurRadius: settings.blurRadius ?? 30,
            sensitivity: settings.sensitivity ?? 0.5,
          },
          onProgress,
        );
```

- [ ] **Step 4: Update `erase-object.ts`**

Same pattern but also extract `clientJobId` from multipart. Note: erase-object has a different multipart structure (file + mask + no settings). Add `clientJobId` extraction in the parts loop.

- [ ] **Step 5: Update `ocr.ts`**

Same pattern. Pass callback to `extractText()`.

- [ ] **Step 6: Verify the API server builds**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/tools/remove-background.ts apps/api/src/routes/tools/upscale.ts apps/api/src/routes/tools/blur-faces.ts apps/api/src/routes/tools/erase-object.ts apps/api/src/routes/tools/ocr.ts
git commit -m "feat(api): wire AI route handlers to SSE progress via clientJobId"
```

---

## Task 6: Build the ProgressCard Component

**Files:**
- Create: `apps/web/src/components/common/progress-card.tsx`

- [ ] **Step 1: Create the ProgressCard component**

```tsx
import { Upload, Loader2 } from "lucide-react";

interface ProgressCardProps {
  active: boolean;
  phase: "uploading" | "processing" | "complete";
  label: string;
  stage?: string;
  percent: number;
  elapsed: number;
}

export function ProgressCard({
  active,
  phase,
  label,
  stage,
  percent,
  elapsed,
}: ProgressCardProps) {
  if (!active) return null;

  const icon =
    phase === "uploading" ? (
      <Upload className="h-4 w-4 text-primary" />
    ) : (
      <Loader2 className="h-4 w-4 text-primary animate-spin" />
    );

  const sublabel = [stage, `${elapsed}s`].filter(Boolean).join(" \u00b7 ");

  return (
    <div className="bg-muted/80 border border-border rounded-xl p-3 space-y-2.5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {label}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {sublabel}
          </div>
        </div>
        <span className="text-sm font-semibold text-primary font-mono tabular-nums">
          {Math.round(percent)}%
        </span>
      </div>
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the web app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/progress-card.tsx
git commit -m "feat(web): add ProgressCard component"
```

---

## Task 7: Rewrite useToolProcessor Hook

**Files:**
- Modify: `apps/web/src/hooks/use-tool-processor.ts`

- [ ] **Step 1: Rewrite with XHR upload progress and SSE**

Replace the entire contents of `apps/web/src/hooks/use-tool-processor.ts`:

```typescript
import { useCallback, useState, useRef, useEffect } from "react";
import { useFileStore } from "@/stores/file-store";
import { TOOLS } from "@stirling-image/shared";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

interface ProcessResult {
  jobId: string;
  downloadUrl: string;
  originalSize: number;
  processedSize: number;
}

export interface ToolProgress {
  phase: "idle" | "uploading" | "processing" | "complete";
  percent: number;
  stage?: string;
  elapsed: number;
}

const IDLE_PROGRESS: ToolProgress = {
  phase: "idle",
  percent: 0,
  elapsed: 0,
};

export function useToolProcessor(toolId: string) {
  const {
    processing,
    error,
    processedUrl,
    originalSize,
    processedSize,
    setProcessing,
    setError,
    setProcessedUrl,
    setSizes,
    setJobId,
  } = useFileStore();

  const [progress, setProgress] = useState<ToolProgress>(IDLE_PROGRESS);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // AI tools that go through Python/bridge.ts and can emit SSE progress.
  // smart-crop is category "ai" but uses Sharp (no Python), so it's excluded.
  const AI_PYTHON_TOOLS = new Set([
    "remove-background", "upscale", "blur-faces", "erase-object", "ocr",
  ]);
  const isAiTool = AI_PYTHON_TOOLS.has(toolId);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (xhrRef.current) xhrRef.current.abort();
    };
  }, []);

  const processFiles = useCallback(
    (files: File[], settings: Record<string, unknown>) => {
      if (files.length === 0) {
        setError("No files selected");
        return;
      }

      setProcessing(true);
      setError(null);
      setProcessedUrl(null);
      setProgress({ phase: "uploading", percent: 0, elapsed: 0 });

      // Start elapsed timer
      const startTime = Date.now();
      elapsedRef.current = setInterval(() => {
        setProgress((prev) => ({
          ...prev,
          elapsed: Math.floor((Date.now() - startTime) / 1000),
        }));
      }, 1000);

      // Generate client job ID for SSE correlation
      const clientJobId = crypto.randomUUID();

      // For AI tools, open SSE before uploading
      if (isAiTool) {
        try {
          const es = new EventSource(
            `/api/v1/jobs/${clientJobId}/progress`,
          );
          eventSourceRef.current = es;

          es.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === "single" && typeof data.percent === "number") {
                setProgress((prev) => ({
                  ...prev,
                  phase: "processing",
                  percent: data.percent,
                  stage: data.stage,
                }));
              }
            } catch {
              // Ignore malformed SSE
            }
          };

          es.onerror = () => {
            // SSE failed — continue without server progress.
            // The upload/response flow still works.
            es.close();
            eventSourceRef.current = null;
          };
        } catch {
          // EventSource creation failed — proceed without SSE
        }
      }

      // Build form data
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("settings", JSON.stringify(settings));
      if (isAiTool) {
        formData.append("clientJobId", clientJobId);
      }

      // Use XHR for upload progress tracking
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const uploadPercent = (event.loaded / event.total) * 100;
          setProgress((prev) => {
            // Only update if we're still in upload phase
            if (prev.phase !== "uploading") return prev;
            return { ...prev, percent: uploadPercent };
          });
        }
      };

      xhr.upload.onload = () => {
        // Upload complete — transition to processing phase
        setProgress((prev) => ({
          ...prev,
          phase: "processing",
          percent: isAiTool ? 0 : 100, // AI tools reset to 0 (SSE will drive), fast tools stay at 100
          stage: isAiTool ? "Starting..." : "Processing...",
        }));
      };

      xhr.onload = () => {
        // Clean up
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result: ProcessResult = JSON.parse(xhr.responseText);
            setJobId(result.jobId);
            setProcessedUrl(result.downloadUrl);
            setSizes(result.originalSize, result.processedSize);
          } catch {
            setError("Invalid response from server");
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            setError(body.error || body.details || `Processing failed: ${xhr.status}`);
          } catch {
            setError(`Processing failed: ${xhr.status}`);
          }
        }

        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      };

      xhr.onerror = () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setError("Network error — check your connection");
        setProcessing(false);
        setProgress(IDLE_PROGRESS);
      };

      xhr.open("POST", `/api/v1/tools/${toolId}`);
      const token = getToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      xhr.send(formData);
    },
    [toolId, isAiTool, setProcessing, setError, setProcessedUrl, setSizes, setJobId],
  );

  return {
    processFiles,
    processing,
    error,
    downloadUrl: processedUrl,
    originalSize,
    processedSize,
    progress,
  };
}
```

- [ ] **Step 2: Verify the web app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-tool-processor.ts
git commit -m "feat(web): rewrite useToolProcessor with XHR upload progress and SSE"
```

---

## Task 8: Migrate AI Tool Settings Components (5 files)

These components are AI tools. 4 currently import `AIProgressBar`, and `ocr-settings.tsx` uses custom fetch (like erase-object). Replace all with `ProgressCard`.

**Files:**
- Modify: `apps/web/src/components/tools/remove-bg-settings.tsx`
- Modify: `apps/web/src/components/tools/blur-faces-settings.tsx`
- Modify: `apps/web/src/components/tools/upscale-settings.tsx`
- Modify: `apps/web/src/components/tools/erase-object-settings.tsx`
- Modify: `apps/web/src/components/tools/ocr-settings.tsx`

- [ ] **Step 1: Update `remove-bg-settings.tsx`**

Remove the `AIProgressBar` import (line 4). Add the `ProgressCard` import:
```typescript
import { ProgressCard } from "@/components/common/progress-card";
```

Destructure `progress` from the hook (line 35-36):
```typescript
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("remove-background");
```

Replace the process button + AIProgressBar block (lines 131-149). The ProgressCard replaces the button when active:
```tsx
      {/* Process button / Progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Removing background"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Remove Background
        </button>
      )}
```

Remove the `Loader2` import if no longer used.

- [ ] **Step 2: Update `blur-faces-settings.tsx`**

Same pattern. Replace `AIProgressBar` import with `ProgressCard`. Destructure `progress`. Replace button+AIProgressBar with:
```tsx
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Blurring faces"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Blur Faces
        </button>
      )}
```

- [ ] **Step 3: Update `upscale-settings.tsx`**

Same pattern. Label: `"Upscaling image"`. Button text: `` `Upscale ${scale}x` ``.

- [ ] **Step 4: Update `erase-object-settings.tsx`**

This component uses its own `fetch` call instead of `useToolProcessor`. It needs a bigger refactor:

1. Replace the manual `fetch` with `useToolProcessor("erase-object")` — but note erase-object sends a `mask` file alongside the main file. The current `useToolProcessor` only sends one file.

For now, keep the custom fetch but add a local progress state that tracks upload progress via XHR. Replace the `fetch` call (lines 35-39) with an XHR-based approach similar to `useToolProcessor`. Add `ProgressCard` with label `"Erasing object"`.

Replace `AIProgressBar` import with `ProgressCard`. Add local progress state and rewrite the `handleProcess` function to use XHR + SSE:

```tsx
import { ProgressCard } from "@/components/common/progress-card";

// Inside the component, add state:
const [progressPhase, setProgressPhase] = useState<"idle" | "uploading" | "processing">("idle");
const [progressPercent, setProgressPercent] = useState(0);
const [progressStage, setProgressStage] = useState<string | undefined>();
const [elapsed, setElapsed] = useState(0);
const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

// Rewrite handleProcess to use XHR:
const handleProcess = () => {
  if (files.length === 0 || !maskFile) return;

  setProcessing(true);
  setError(null);
  setDownloadUrl(null);
  setProgressPhase("uploading");
  setProgressPercent(0);
  setElapsed(0);

  const startTime = Date.now();
  elapsedRef.current = setInterval(() => {
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
  }, 1000);

  const clientJobId = crypto.randomUUID();

  // Open SSE for server-side progress
  const es = new EventSource(`/api/v1/jobs/${clientJobId}/progress`);
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "single" && typeof data.percent === "number") {
        setProgressPhase("processing");
        setProgressPercent(data.percent);
        setProgressStage(data.stage);
      }
    } catch {}
  };
  es.onerror = () => es.close();

  const formData = new FormData();
  formData.append("file", files[0]);
  formData.append("mask", maskFile);
  formData.append("clientJobId", clientJobId);

  const xhr = new XMLHttpRequest();
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) setProgressPercent((e.loaded / e.total) * 100);
  };
  xhr.upload.onload = () => {
    setProgressPhase("processing");
    setProgressPercent(0);
    setProgressStage("Starting...");
  };
  xhr.onload = () => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    es.close();
    if (xhr.status >= 200 && xhr.status < 300) {
      const data = JSON.parse(xhr.responseText);
      setDownloadUrl(data.downloadUrl);
      setOriginalSize(data.originalSize);
      setProcessedSize(data.processedSize);
    } else {
      const body = JSON.parse(xhr.responseText);
      setError(body.error || body.details || `Failed: ${xhr.status}`);
    }
    setProcessing(false);
    setProgressPhase("idle");
  };
  xhr.onerror = () => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    es.close();
    setError("Network error");
    setProcessing(false);
    setProgressPhase("idle");
  };
  xhr.open("POST", "/api/v1/tools/erase-object");
  xhr.setRequestHeader("Authorization", `Bearer ${getToken()}`);
  xhr.send(formData);
};
```

Replace the button + AIProgressBar with:
```tsx
{processing ? (
  <ProgressCard
    active={processing}
    phase={progressPhase === "idle" ? "uploading" : progressPhase}
    label="Erasing object"
    stage={progressStage}
    percent={progressPercent}
    elapsed={elapsed}
  />
) : (
  <button
    onClick={handleProcess}
    disabled={!hasFile || !maskFile || processing}
    className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
  >
    Erase Object
  </button>
)}
```

- [ ] **Step 5: Update `ocr-settings.tsx`**

`ocr-settings.tsx` also uses custom fetch (not `useToolProcessor`). Apply the same XHR + SSE pattern as erase-object above, with label `"Extracting text"`. Extract `clientJobId` from multipart, open SSE, track upload progress.

- [ ] **Step 6: Verify the web app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/tools/remove-bg-settings.tsx apps/web/src/components/tools/blur-faces-settings.tsx apps/web/src/components/tools/upscale-settings.tsx apps/web/src/components/tools/erase-object-settings.tsx apps/web/src/components/tools/ocr-settings.tsx
git commit -m "feat(web): migrate AI tool settings to ProgressCard"
```

---

## Task 9: Migrate Non-AI Tool Settings Components

Two groups of components need migration:

**Group A — 11 files using `useToolProcessor` (straightforward):**
`color-settings.tsx`, `crop-settings.tsx`, `rotate-settings.tsx`, `compress-settings.tsx`, `resize-settings.tsx`, `strip-metadata-settings.tsx`, `convert-settings.tsx`, `smart-crop-settings.tsx`, `text-overlay-settings.tsx`, `watermark-text-settings.tsx`, `replace-color-settings.tsx`, `gif-tools-settings.tsx`, `border-settings.tsx`

Pattern: destructure `progress` from `useToolProcessor`, replace button+Loader2 with ProgressCard.

**Group B — 17 files using custom fetch (skip or defer):**
`collage-settings.tsx`, `compose-settings.tsx`, `favicon-settings.tsx`, `image-to-pdf-settings.tsx`, `vectorize-settings.tsx`, `split-settings.tsx`, `svg-to-raster-settings.tsx`, `watermark-image-settings.tsx`, `bulk-rename-settings.tsx`, `find-duplicates-settings.tsx`, `color-palette-settings.tsx`, `barcode-read-settings.tsx`, `qr-generate-settings.tsx`, `info-settings.tsx`, `compare-settings.tsx`

These do not use `useToolProcessor`. Either refactor them to use `useToolProcessor` first, or add inline XHR progress tracking. For v1, **skip these** — they are fast tools where the existing spinner is acceptable. Migrate them in a follow-up pass.

- [ ] **Step 1: Update Group A tool settings components (11 files)**

For each Group A file, apply this transformation:

**Add import:**
```typescript
import { ProgressCard } from "@/components/common/progress-card";
```

**Destructure progress:**
```typescript
const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("TOOL_ID");
```

**Replace button block:**
```tsx
{processing ? (
  <ProgressCard
    active={processing}
    phase={progress.phase === "idle" ? "uploading" : progress.phase}
    label="TOOL_LABEL"
    stage={progress.stage}
    percent={progress.percent}
    elapsed={progress.elapsed}
  />
) : (
  <button
    onClick={handleProcess}
    disabled={!hasFile || processing}
    className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
  >
    BUTTON_TEXT
  </button>
)}
```

**Tool labels for Group A** (use the action name, not the tool name):
| File | label | button text |
|------|-------|-------------|
| resize-settings.tsx | "Resizing" | "Resize" |
| crop-settings.tsx | "Cropping" | "Crop" |
| rotate-settings.tsx | "Rotating" | "Rotate" |
| convert-settings.tsx | "Converting" | "Convert" |
| compress-settings.tsx | "Compressing" | "Compress" |
| strip-metadata-settings.tsx | "Stripping metadata" | "Strip Metadata" |
| color-settings.tsx | "Adjusting colors" | "Apply" |
| replace-color-settings.tsx | "Replacing color" | "Replace Color" |
| border-settings.tsx | "Adding border" | "Add Border" |
| watermark-text-settings.tsx | "Adding watermark" | "Add Watermark" |
| text-overlay-settings.tsx | "Adding text" | "Add Text" |
| smart-crop-settings.tsx | "Smart cropping" | "Smart Crop" |
| gif-tools-settings.tsx | "Processing GIF" | "Process" |

- [ ] **Step 2: Verify the web app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/tools/
git commit -m "feat(web): add ProgressCard to non-AI tool settings (Group A)"
```

---

## Task 10: Delete Old AIProgressBar and Clean Up

**Files:**
- Delete: `apps/web/src/components/common/ai-progress-bar.tsx`

- [ ] **Step 1: Verify no remaining imports of AIProgressBar**

Search for any remaining references:
```bash
grep -r "AIProgressBar\|ai-progress-bar" apps/web/src/
```
Expected: No results. If any remain, update those files first.

- [ ] **Step 2: Delete the file**

```bash
rm apps/web/src/components/common/ai-progress-bar.tsx
```

- [ ] **Step 3: Verify the web app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src/components/common/ai-progress-bar.tsx
git commit -m "chore(web): delete old AIProgressBar component"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Build the full project**

Run: `pnpm build`
Expected: All packages build successfully

- [ ] **Step 2: Start the dev server and test**

Run: `pnpm dev`

Manual testing checklist:
1. **Fast tool (resize):** Upload a large image (>5MB). Verify you see upload progress in the ProgressCard. Verify it transitions to "Processing..." briefly, then disappears and shows the download button.
2. **AI tool (remove-background):** Upload an image. Verify you see upload progress, then real server-side stages (Loading model → Model loaded → Analyzing image → Background removed → Saving result) with percentage updates.
3. **Small file fast tool:** Upload a tiny image to compress. Verify the progress card flashes briefly and doesn't get stuck.
4. **Error case:** Try to process without uploading a file. Verify error message appears correctly.

- [ ] **Step 3: Commit any fixes from testing**
