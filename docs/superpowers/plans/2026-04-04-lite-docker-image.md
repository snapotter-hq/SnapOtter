# Lite Docker Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `:lite` Docker tag (~1-2 GB) that includes all Sharp-based tools but drops the Python AI/ML sidecar.

**Architecture:** Single Dockerfile with `ARG VARIANT=full` (default). In lite mode, Python/ML packages and model downloads are skipped. The API returns 501 for AI routes, and the frontend greys out AI tools with an upgrade toast. CI publishes both `:latest` and `:lite` tags.

**Tech Stack:** Docker multi-stage builds, Fastify, React/Zustand, sonner (toast), VitePress, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-04-04-lite-docker-image-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/shared/src/constants.ts` | Add `PYTHON_SIDECAR_TOOLS` constant |
| Modify | `apps/api/src/routes/settings.ts` | Add `variant` + `variantUnavailableTools` to GET response |
| Modify | `apps/api/src/routes/tools/index.ts` | Register 501 stubs for AI tools in lite mode |
| Create | `tests/integration/lite-variant.test.ts` | Integration tests for lite mode API behavior |
| Create | `apps/web/src/stores/settings-store.ts` | Zustand store for shared settings + variant info |
| Modify | `apps/web/src/App.tsx` | Add sonner `<Toaster />` |
| Modify | `apps/web/src/components/common/tool-card.tsx` | AI badge, grey-out, toast on click |
| Modify | `apps/web/src/components/layout/tool-panel.tsx` | Use settings store for variant filtering |
| Modify | `apps/web/src/pages/home-page.tsx` | Grey out variant-unavailable tools |
| Modify | `apps/web/src/hooks/use-tool-processor.ts` | Import `PYTHON_SIDECAR_TOOLS` from shared |
| Modify | `docker/Dockerfile` | Add `ARG VARIANT`, conditional Python install |
| Modify | `.github/workflows/ci.yml` | Matrix for both variants in Docker smoke test |
| Modify | `.github/workflows/release.yml` | Matrix for publishing both `:latest` and `:lite` |
| Create | `apps/docs/guide/docker-tags.md` | Docs page explaining lite vs full |
| Modify | `apps/docs/.vitepress/config.mts` | Add sidebar entry for docker-tags page |

---

### Task 1: Add PYTHON_SIDECAR_TOOLS Constant

**Files:**
- Modify: `packages/shared/src/constants.ts` (append after `TOOLS` array)

- [ ] **Step 1: Add the constant**

At the end of `packages/shared/src/constants.ts`, after the `TOOLS` array and any other exports, add:

```typescript
/**
 * Tool IDs that require the Python sidecar (AI/ML tools).
 * Used by the API to register 501 stubs in lite mode,
 * and by the frontend for progress/timeout behavior.
 */
export const PYTHON_SIDECAR_TOOLS = [
  "remove-background",
  "upscale",
  "blur-faces",
  "erase-object",
  "ocr",
] as const;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants.ts
git commit -m "feat: add PYTHON_SIDECAR_TOOLS constant to shared package"
```

---

### Task 2: API - Settings Endpoint Variant Info

**Files:**
- Create: `tests/integration/lite-variant.test.ts`
- Modify: `apps/api/src/routes/settings.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/lite-variant.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "./test-server.js";

describe("Lite variant", () => {
  let testApp: TestApp;
  let app: TestApp["app"];
  let adminToken: string;

  beforeAll(async () => {
    process.env.STIRLING_VARIANT = "lite";
    testApp = await buildTestApp();
    app = testApp.app;
    adminToken = await loginAsAdmin(app);
  }, 30_000);

  afterAll(async () => {
    delete process.env.STIRLING_VARIANT;
    await testApp.cleanup();
  }, 10_000);

  describe("GET /api/v1/settings", () => {
    it("includes variant and variantUnavailableTools", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.variant).toBe("lite");
      expect(body.variantUnavailableTools).toEqual([
        "remove-background",
        "upscale",
        "blur-faces",
        "erase-object",
        "ocr",
      ]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/lite-variant.test.ts`
Expected: FAIL - `body.variant` is undefined

- [ ] **Step 3: Implement variant info in settings endpoint**

In `apps/api/src/routes/settings.ts`, add the import at the top:

```typescript
import { PYTHON_SIDECAR_TOOLS } from "@stirling-image/shared";
```

Then modify the GET handler (around line 18-30). Replace the `return reply.send({ settings });` line with:

```typescript
    const variant = process.env.STIRLING_VARIANT === "lite" ? "lite" : "full";
    const variantUnavailableTools =
      variant === "lite" ? [...PYTHON_SIDECAR_TOOLS] : [];

    return reply.send({ settings, variant, variantUnavailableTools });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/lite-variant.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/integration/lite-variant.test.ts apps/api/src/routes/settings.ts
git commit -m "feat: include variant and variantUnavailableTools in settings response"
```

---

### Task 3: API - 501 Stubs for AI Routes in Lite Mode

**Files:**
- Modify: `tests/integration/lite-variant.test.ts`
- Modify: `apps/api/src/routes/tools/index.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/lite-variant.test.ts`, inside the outer `describe("Lite variant")` block, after the settings tests:

```typescript
  describe("AI tool routes return 501", () => {
    const aiTools = [
      "remove-background",
      "upscale",
      "blur-faces",
      "erase-object",
      "ocr",
    ];

    for (const toolId of aiTools) {
      it(`POST /api/v1/tools/${toolId} returns 501`, async () => {
        const res = await app.inject({
          method: "POST",
          url: `/api/v1/tools/${toolId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {},
        });

        expect(res.statusCode).toBe(501);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("Not Available");
        expect(body.message).toContain("full image");
      });
    }
  });

  describe("Sharp tools still work in lite mode", () => {
    it("POST /api/v1/tools/info returns 200 with valid image", async () => {
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const __dirname = join(fileURLToPath(import.meta.url), "..");
      const png = readFileSync(join(__dirname, "..", "fixtures", "test-200x150.png"));

      const boundary = "----TestBoundary";
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        png,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/info",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(200);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/lite-variant.test.ts`
Expected: FAIL - AI tools return something other than 501 (likely 400 or 500)

- [ ] **Step 3: Implement 501 stubs in lite mode**

In `apps/api/src/routes/tools/index.ts`, add the import at the top:

```typescript
import { PYTHON_SIDECAR_TOOLS } from "@stirling-image/shared";
```

Then, inside the `registerToolRoutes` function, after the `skipTools` set is built (after line 67) and before the `toolRegistrations` array, add:

```typescript
  // In lite mode, register 501 stubs for AI tools instead of real handlers
  const isLite = process.env.STIRLING_VARIANT === "lite";
  const liteStubTools = new Set<string>(PYTHON_SIDECAR_TOOLS);
```

Then modify the registration loop (currently lines 123-131). Replace it with:

```typescript
  let skipped = 0;
  let stubbed = 0;
  for (const { id, register } of toolRegistrations) {
    if (skipTools.has(id)) {
      app.log.info(`Skipping disabled/experimental tool: ${id}`);
      skipped++;
      continue;
    }

    if (isLite && liteStubTools.has(id)) {
      // Register a 501 stub instead of the real handler
      app.post(`/api/v1/tools/${id}`, async (_request, reply) => {
        return reply.status(501).send({
          statusCode: 501,
          error: "Not Available",
          message: `The "${id}" tool requires the full image. Pull stirlingimage/stirling-image:latest for all features.`,
        });
      });
      stubbed++;
      continue;
    }

    register(app);
  }
```

Update the log line at the end:

```typescript
  const registered = toolRegistrations.length - skipped - stubbed;
  app.log.info(
    `Tool routes: ${registered} active, ${stubbed} lite-stubbed, ${skipped} skipped (${toolRegistrations.length} total)`,
  );
```

Also remove the individual AI tool imports that are no longer needed in lite mode. Wrap them in a conditional dynamic import. Replace the static AI imports (lines 6, 17, 22, 25, 34) with lazy registration. Change the `toolRegistrations` array entries for AI tools to use `register: () => {}` as placeholders, and instead do the actual registration conditionally.

Simpler approach: keep the static imports. They are just JavaScript module imports that don't trigger Python. The bridge only spawns Python on actual request. The 501 stub intercepts before the real handler runs, so the imports are harmless. The only cost is a few KB of JS loaded but never executed.

**Keep the existing imports as-is. No changes needed to the import block.**

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/lite-variant.test.ts`
Expected: PASS

- [ ] **Step 5: Run full integration suite to ensure no regressions**

Run: `pnpm test:integration`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/integration/lite-variant.test.ts apps/api/src/routes/tools/index.ts
git commit -m "feat: register 501 stubs for AI tools in lite mode"
```

---

### Task 4: Frontend - Install Sonner and Create Settings Store

**Files:**
- Modify: `apps/web/package.json` (via pnpm add)
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/stores/settings-store.ts`

- [ ] **Step 1: Install sonner**

Run: `pnpm --filter @stirling-image/web add sonner`

- [ ] **Step 2: Add Toaster to App.tsx**

In `apps/web/src/App.tsx`, add the import at the top:

```typescript
import { Toaster } from "sonner";
```

Inside the `App` component's return, add `<Toaster />` after `<ErrorBoundary>` and before `<BrowserRouter>`:

```typescript
export function App() {
  return (
    <ErrorBoundary>
      <Toaster position="bottom-right" />
      <BrowserRouter>
```

- [ ] **Step 3: Create settings store**

Create `apps/web/src/stores/settings-store.ts`:

```typescript
import { create } from "zustand";
import { apiGet } from "@/lib/api";

interface SettingsState {
  variant: "full" | "lite";
  variantUnavailableTools: string[];
  disabledTools: string[];
  experimentalEnabled: boolean;
  loaded: boolean;
  fetch: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  variant: "full",
  variantUnavailableTools: [],
  disabledTools: [],
  experimentalEnabled: false,
  loaded: false,

  fetch: async () => {
    if (get().loaded) return;
    try {
      const data = await apiGet<{
        settings: Record<string, string>;
        variant: "full" | "lite";
        variantUnavailableTools: string[];
      }>("/v1/settings");

      set({
        variant: data.variant ?? "full",
        variantUnavailableTools: data.variantUnavailableTools ?? [],
        disabledTools: data.settings.disabledTools
          ? JSON.parse(data.settings.disabledTools)
          : [],
        experimentalEnabled: data.settings.enableExperimentalTools === "true",
        loaded: true,
      });
    } catch {
      // Settings fetch failed - default to full with no disabled tools
      set({ loaded: true });
    }
  },
}));
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/App.tsx apps/web/src/stores/settings-store.ts pnpm-lock.yaml
git commit -m "feat: add sonner toast and settings store for variant support"
```

---

### Task 5: Frontend - Update ToolCard for Variant-Unavailable Tools

**Files:**
- Modify: `apps/web/src/components/common/tool-card.tsx`

- [ ] **Step 1: Update ToolCard to accept variantUnavailable prop**

Replace the entire content of `apps/web/src/components/common/tool-card.tsx`:

```typescript
import type { Tool } from "@stirling-image/shared";
import * as icons from "lucide-react";
import { FileImage, Sparkles, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ToolCardProps {
  tool: Tool;
  variantUnavailable?: boolean;
}

export function ToolCard({ tool, variantUnavailable }: ToolCardProps) {
  const iconsMap = icons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const IconComponent = iconsMap[tool.icon] || FileImage;

  if (variantUnavailable) {
    return (
      <div className="group flex items-center gap-3 relative">
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 transition-opacity absolute -left-5"
          title="Add to favourites"
        >
          <Star className="h-3 w-3 text-muted-foreground hover:text-yellow-500" />
        </button>
        <button
          type="button"
          onClick={() =>
            toast("This tool requires the full image.", {
              description:
                "Pull stirlingimage/stirling-image:latest for all features including AI tools.",
              action: {
                label: "Learn more",
                onClick: () =>
                  window.open(
                    "https://stirling-image.github.io/stirling-image/guide/docker-tags",
                    "_blank",
                  ),
              },
            })
          }
          className="flex items-center gap-3 py-2 px-3 rounded-lg w-full transition-colors hover:bg-muted/50 opacity-50 cursor-pointer"
        >
          <IconComponent className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{tool.name}</span>
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
            <Sparkles className="h-2.5 w-2.5" />
            AI
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 relative">
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 transition-opacity absolute -left-5"
        title="Add to favourites"
      >
        <Star className="h-3 w-3 text-muted-foreground hover:text-yellow-500" />
      </button>
      <Link
        to={tool.route}
        className={cn(
          "flex items-center gap-3 py-2 px-3 rounded-lg w-full transition-colors",
          "hover:bg-muted",
          tool.disabled && "opacity-50 pointer-events-none",
        )}
      >
        <IconComponent className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{tool.name}</span>
        {tool.experimental && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">
            Experimental
          </span>
        )}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/tool-card.tsx
git commit -m "feat: ToolCard shows AI badge and upgrade toast for variant-unavailable tools"
```

---

### Task 6: Frontend - Update ToolPanel to Use Settings Store

**Files:**
- Modify: `apps/web/src/components/layout/tool-panel.tsx`

- [ ] **Step 1: Replace local state with settings store**

Replace the entire content of `apps/web/src/components/layout/tool-panel.tsx`:

```typescript
import { CATEGORIES, TOOLS } from "@stirling-image/shared";
import { useEffect, useMemo, useState } from "react";
import { SearchBar } from "../common/search-bar";
import { ToolCard } from "../common/tool-card";
import { useSettingsStore } from "@/stores/settings-store";

export function ToolPanel() {
  const [search, setSearch] = useState("");
  const { disabledTools, experimentalEnabled, variantUnavailableTools, loaded, fetch } =
    useSettingsStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  const unavailableSet = useMemo(
    () => new Set(variantUnavailableTools),
    [variantUnavailableTools],
  );

  const visibleTools = useMemo(() => {
    if (!loaded) return [];
    return TOOLS.filter((t) => {
      if (disabledTools.includes(t.id)) return false;
      if (t.experimental && !experimentalEnabled) return false;
      return true;
    });
  }, [disabledTools, experimentalEnabled, loaded]);

  const filteredTools = useMemo(() => {
    if (!search) return visibleTools;
    const q = search.toLowerCase();
    return visibleTools.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [search, visibleTools]);

  const groupedTools = useMemo(() => {
    const groups = new Map<string, typeof TOOLS>();
    for (const tool of filteredTools) {
      const list = groups.get(tool.category) || [];
      list.push(tool);
      groups.set(tool.category, list);
    }
    return groups;
  }, [filteredTools]);

  return (
    <div className="w-72 border-r border-border bg-background overflow-y-auto flex flex-col shrink-0">
      <div className="p-3 sticky top-0 bg-background z-10">
        <SearchBar value={search} onChange={setSearch} />
      </div>
      <div className="px-3 pb-4 flex-1">
        {CATEGORIES.filter((cat) => groupedTools.has(cat.id)).map((category) => (
          <div key={category.id} className="mb-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
              {category.name}
            </h3>
            <div className="space-y-0.5">
              {groupedTools.get(category.id)?.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  variantUnavailable={unavailableSet.has(tool.id)}
                />
              ))}
            </div>
          </div>
        ))}
        {filteredTools.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No tools found</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/tool-panel.tsx
git commit -m "feat: ToolPanel uses settings store for variant-aware tool filtering"
```

---

### Task 7: Frontend - Update HomePage for Variant-Unavailable Tools

**Files:**
- Modify: `apps/web/src/pages/home-page.tsx`

- [ ] **Step 1: Add variant awareness to HomePage**

In `apps/web/src/pages/home-page.tsx`, add the import near the top:

```typescript
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings-store";
```

Inside the `HomePage` component, after the existing hooks (`useFileStore`, `useNavigate`), add:

```typescript
  const { variantUnavailableTools, fetch: fetchSettings } = useSettingsStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const unavailableSet = useMemo(
    () => new Set(variantUnavailableTools),
    [variantUnavailableTools],
  );
```

Add `useEffect` and `useMemo` to the existing import from `react`:

```typescript
import { useCallback, useEffect, useMemo } from "react";
```

Modify `handleToolClick` to check for variant-unavailable tools:

```typescript
  const handleToolClick = (route: string, toolId: string) => {
    if (unavailableSet.has(toolId)) {
      toast("This tool requires the full image.", {
        description:
          "Pull stirlingimage/stirling-image:latest for all features including AI tools.",
        action: {
          label: "Learn more",
          onClick: () =>
            window.open(
              "https://stirling-image.github.io/stirling-image/guide/docker-tags",
              "_blank",
            ),
        },
      });
      return;
    }
    navigate(route);
  };
```

Update the quick actions button `onClick` (around line 83):

```typescript
onClick={() => handleToolClick(tool.route, tool.id)}
```

Add opacity styling to quick action buttons for unavailable tools (around line 84):

```typescript
className={cn(
  "flex items-center gap-2 p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left",
  unavailableSet.has(id) && "opacity-50",
)}
```

Update the "All Tools" section button `onClick` (around line 125):

```typescript
onClick={() => handleToolClick(tool.route, tool.id)}
```

Add opacity styling to the all-tools buttons for unavailable tools (around line 126-129):

```typescript
className={cn(
  "flex items-center gap-2.5 w-full py-1.5 px-2 rounded-lg text-left transition-colors",
  unavailableSet.has(tool.id)
    ? "opacity-50 hover:bg-muted/50"
    : "hover:bg-muted text-foreground",
)}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/home-page.tsx
git commit -m "feat: HomePage greys out variant-unavailable tools with upgrade toast"
```

---

### Task 8: Frontend - Update use-tool-processor to Use Shared Constant

**Files:**
- Modify: `apps/web/src/hooks/use-tool-processor.ts`

- [ ] **Step 1: Replace hardcoded set with shared constant**

In `apps/web/src/hooks/use-tool-processor.ts`, add the import at the top:

```typescript
import { PYTHON_SIDECAR_TOOLS } from "@stirling-image/shared";
```

Replace lines 30-38 (the `AI_PYTHON_TOOLS` definition):

```typescript
// AI tools that go through Python/bridge.ts and can emit SSE progress.
// smart-crop is category "ai" but uses Sharp (no Python), so it's excluded.
const AI_PYTHON_TOOLS = new Set([
  "remove-background",
  "upscale",
  "blur-faces",
  "erase-object",
  "ocr",
]);
```

With:

```typescript
// AI tools that go through Python/bridge.ts and can emit SSE progress.
// smart-crop is category "ai" but uses Sharp (no Python), so it's excluded.
const AI_PYTHON_TOOLS = new Set<string>(PYTHON_SIDECAR_TOOLS);
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run linter**

Run: `pnpm lint`
Expected: PASS (no unused imports, formatting OK)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/use-tool-processor.ts
git commit -m "refactor: use shared PYTHON_SIDECAR_TOOLS constant in use-tool-processor"
```

---

### Task 9: Dockerfile - Add VARIANT Build Arg

**Files:**
- Modify: `docker/Dockerfile`

- [ ] **Step 1: Add build arg and conditional Python install**

At the very top of `docker/Dockerfile`, after the comment header (line 5) and before Stage 1, add:

```dockerfile
ARG VARIANT=full
```

In the production stage (after line 41 `FROM node:22-bookworm AS production`), re-declare the arg:

```dockerfile
ARG VARIANT
```

Replace the system dependencies block (lines 46-57) with:

```dockerfile
# System dependencies shared by all variants
RUN apt-get update && apt-get install -y --no-install-recommends \
    imagemagick \
    libraw-dev \
    potrace \
    curl \
    gosu \
    libheif-examples \
    && rm -rf /var/lib/apt/lists/*

# Python/ML system dependencies (full variant only)
RUN if [ "$VARIANT" = "full" ]; then \
    apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv python3-dev \
        tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa \
        build-essential \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
; fi
```

Replace the Python venv and ML install block (lines 59-88) with:

```dockerfile
# Python venv + ML packages + model weights (full variant only)
COPY packages/ai/python/requirements.txt /tmp/requirements.txt
RUN if [ "$VARIANT" = "full" ]; then \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install \
        Pillow numpy opencv-python-headless onnxruntime && \
    (/opt/venv/bin/pip install rembg[cpu] || echo "WARNING: rembg not installed") && \
    (/opt/venv/bin/pip install realesrgan || echo "WARNING: realesrgan not installed") && \
    (/opt/venv/bin/pip install paddlepaddle paddleocr || echo "WARNING: PaddleOCR not installed") && \
    (/opt/venv/bin/pip install mediapipe || echo "WARNING: mediapipe not installed") && \
    (/opt/venv/bin/pip install lama-cleaner || echo "WARNING: lama-cleaner not installed") \
; fi && rm -f /tmp/requirements.txt

COPY docker/download_models.py /tmp/download_models.py
RUN if [ "$VARIANT" = "full" ]; then \
    /opt/venv/bin/python3 /tmp/download_models.py && \
    /opt/venv/bin/python3 -c "\
try: \
    from paddleocr import PaddleOCR; \
    print('Downloading PaddleOCR models...'); \
    ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False); \
    print('PaddleOCR models ready'); \
except: print('PaddleOCR model pre-download skipped') \
" 2>/dev/null || echo "WARNING: Could not pre-download PaddleOCR models" \
; fi && rm -f /tmp/download_models.py
```

Replace the build-essential cleanup block (lines 108-109) with:

```dockerfile
RUN if [ "$VARIANT" = "full" ]; then \
    apt-get purge -y --auto-remove build-essential python3-dev && \
    rm -rf /var/lib/apt/lists/* \
; fi
```

Add the variant env var to the ENV block (after `RATE_LIMIT_PER_MIN=100` on line 146):

```dockerfile
    STIRLING_VARIANT=${VARIANT}
```

Update the `chown` line to handle the case where `/opt/venv` doesn't exist in lite mode. Replace line 150:

```dockerfile
RUN chown -R stirling:stirling /app /data /tmp/workspace && \
    ([ -d /opt/venv ] && chown -R stirling:stirling /opt/venv || true)
```

- [ ] **Step 2: Test lite build locally**

Run: `docker build --build-arg VARIANT=lite -f docker/Dockerfile -t stirling-image:lite-test .`
Expected: Build succeeds. No Python installation steps in the output.

- [ ] **Step 3: Test full build still works**

Run: `docker build -f docker/Dockerfile -t stirling-image:full-test .`
Expected: Build succeeds with Python/ML installation as before.

- [ ] **Step 4: Verify lite image is smaller**

Run: `docker images | grep stirling-image`
Expected: `lite-test` is ~1-2 GB, `full-test` is ~11 GB.

- [ ] **Step 5: Commit**

```bash
git add docker/Dockerfile
git commit -m "feat: add VARIANT build arg to Dockerfile for lite image support"
```

---

### Task 10: CI - Add Lite Variant Smoke Test

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add matrix to docker job**

Replace the docker job in `.github/workflows/ci.yml` (lines 82-98) with:

```yaml
  docker:
    name: Docker Build Test (${{ matrix.variant }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        variant: [full, lite]
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile
          push: false
          build-args: VARIANT=${{ matrix.variant }}
          tags: stirling-image:ci-${{ matrix.variant }}
          cache-from: type=gha,scope=${{ matrix.variant }}
          cache-to: type=gha,mode=max,scope=${{ matrix.variant }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add matrix to build both full and lite Docker variants"
```

---

### Task 11: Release - Matrix for Publishing Both Variants

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Replace single docker job with matrix**

Replace the entire `docker` job in `.github/workflows/release.yml` (lines 51-105) with:

```yaml
  docker:
    name: Docker (${{ matrix.variant }})
    needs: release
    if: needs.release.outputs.new_version != ''
    runs-on: ubuntu-latest
    strategy:
      matrix:
        variant: [full, lite]
        include:
          - variant: full
            suffix: ""
          - variant: lite
            suffix: "-lite"
    steps:
      - name: Checkout release tag
        uses: actions/checkout@v4
        with:
          ref: v${{ needs.release.outputs.new_version }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: |
            stirlingimage/stirling-image
            ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}${{ matrix.suffix }},value=v${{ needs.release.outputs.new_version }}
            type=semver,pattern={{major}}.{{minor}}${{ matrix.suffix }},value=v${{ needs.release.outputs.new_version }}
            type=semver,pattern={{major}}${{ matrix.suffix }},value=v${{ needs.release.outputs.new_version }}
            type=raw,value=${{ matrix.variant == 'full' && 'latest' || 'lite' }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile
          push: true
          build-args: VARIANT=${{ matrix.variant }}
          platforms: linux/amd64,linux/arm64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=${{ matrix.variant }}
          cache-to: type=gha,mode=max,scope=${{ matrix.variant }}
```

This produces for a v1.6.0 release:

| Variant | Tags |
|---------|------|
| full | `1.6.0`, `1.6`, `1`, `latest` |
| lite | `1.6.0-lite`, `1.6-lite`, `1-lite`, `lite` |

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish both full and lite Docker images on release"
```

---

### Task 12: Documentation - Docker Tags Page

**Files:**
- Create: `apps/docs/guide/docker-tags.md`
- Modify: `apps/docs/.vitepress/config.mts`

- [ ] **Step 1: Create the docs page**

Create `apps/docs/guide/docker-tags.md`:

```markdown
# Docker Image Tags

Stirling Image ships two Docker image variants to fit different use cases.

## Full (default)

```bash
docker pull stirlingimage/stirling-image:latest
```

Includes all tools: image processing, AI-powered background removal, upscaling, face blurring, object erasing, and OCR. Size is ~11 GB due to bundled ML models.

## Lite

```bash
docker pull stirlingimage/stirling-image:lite
```

Includes all image processing tools (resize, crop, rotate, convert, compress, watermark, collage, and 20+ more) but excludes AI/ML tools. Size is ~1-2 GB.

Use this if you:
- Only need standard image processing (no AI features)
- Are running on constrained hardware (Raspberry Pi, small VPS)
- Want faster pulls and smaller disk footprint

### Tools excluded from lite

| Tool | What it does |
|------|-------------|
| Remove Background | AI-powered background removal |
| Upscale | AI super-resolution upscaling |
| Blur Faces | AI face detection and blurring |
| Erase Object | AI inpainting to remove objects |
| OCR | Optical character recognition |

All other tools (27+) work identically in both variants.

## Docker Compose

### Full

```yaml
services:
  stirling-image:
    image: stirlingimage/stirling-image:latest
    ports:
      - "1349:1349"
    volumes:
      - stirling-data:/data
      - stirling-workspace:/tmp/workspace

volumes:
  stirling-data:
  stirling-workspace:
```

### Lite

```yaml
services:
  stirling-image:
    image: stirlingimage/stirling-image:lite
    ports:
      - "1349:1349"
    volumes:
      - stirling-data:/data
      - stirling-workspace:/tmp/workspace

volumes:
  stirling-data:
  stirling-workspace:
```

## Switching from lite to full

To upgrade from lite to full and unlock AI tools:

1. Stop your container
2. Pull the full image: `docker pull stirlingimage/stirling-image:latest`
3. Update your compose file or run command to use `:latest` instead of `:lite`
4. Start the container

Your data and settings are preserved in the volumes.

## Version pinning

Both variants support semver tags for pinning:

| Tag | Description |
|-----|------------|
| `latest` | Latest full release |
| `lite` | Latest lite release |
| `1.6.0` | Exact full version |
| `1.6.0-lite` | Exact lite version |
| `1.6` | Latest patch in 1.6.x (full) |
| `1.6-lite` | Latest patch in 1.6.x (lite) |
```

- [ ] **Step 2: Add sidebar entry**

In `apps/docs/.vitepress/config.mts`, add an entry to the Guide sidebar items array (after the "Deployment" entry, around line 34):

```typescript
          { text: "Docker tags", link: "/guide/docker-tags" },
```

- [ ] **Step 3: Commit**

```bash
git add apps/docs/guide/docker-tags.md apps/docs/.vitepress/config.mts
git commit -m "docs: add Docker tags guide for full vs lite image"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All unit and integration tests PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run linter**

Run: `pnpm lint`
Expected: PASS (run `pnpm lint:fix` if formatting issues)

- [ ] **Step 4: Verify lite Docker build**

Run: `docker build --build-arg VARIANT=lite -f docker/Dockerfile -t stirling-image:lite-verify .`
Expected: Build succeeds, no Python in image

- [ ] **Step 5: Smoke test lite container**

Run: `docker run --rm -d -p 1349:1349 --name si-lite stirling-image:lite-verify`

Verify:
- Health check passes: `curl http://localhost:1349/api/v1/health`
- Settings show lite variant: `curl -H "Authorization: Bearer <token>" http://localhost:1349/api/v1/settings | jq .variant`
- AI route returns 501: `curl -X POST http://localhost:1349/api/v1/tools/remove-background`

Run: `docker stop si-lite`

- [ ] **Step 6: Check image size**

Run: `docker images stirling-image:lite-verify --format '{{.Size}}'`
Expected: ~1-2 GB
