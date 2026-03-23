# Resize & Rotate/Flip UX Redesign

## Problem

The before/after comparison slider is a poor fit for resize and rotate/flip tools:
- **Resize** overlays two different-sized images — doesn't communicate anything useful. Users care about "how big will it be?" not pixel-level comparison.
- **Rotate/Flip** transformations are self-evident. A slider adds nothing.

The resize settings also use technical jargon (contain, cover, fill, inside, outside) that confuses layman users.

## Design

### Resize: Tab-Based Settings with Presets Front-and-Center

Replace the current mode toggle (Pixels/Percentage) with three tabs:

#### Presets Tab (default)
- Single-column scrollable list of cards grouped by platform (Instagram, Twitter/X, Facebook, YouTube, LinkedIn) — the sidebar is 18rem wide, so single-column avoids cramped cards
- Each card shows: platform icon, preset name (e.g., "Post", "Story", "Header"), dimensions (e.g., "1080 × 1080")
- Clicking a card selects it (highlighted border), clicking again deselects
- Selected preset populates the dimensions automatically
- Presets use "Crop to fit" (cover) as the default fit mode — this is the expected behavior for social media sizing
- "Don't enlarge" checkbox available below preset grid
- Process button at bottom

#### Custom Size Tab
- Width and Height number inputs
- Aspect ratio lock toggle between them (link/unlink icon)
- Fit mode as 3 plain-language options:
  - "Crop to fit" (maps to sharp `cover`)
  - "Fit inside" (maps to sharp `contain`)
  - "Stretch" (maps to sharp `fill`)
- Remove "inside" and "outside" fit modes — they confuse laymen
- "Don't enlarge" checkbox
- Process button at bottom

#### Scale Tab
- Percentage number input
- Quick-select buttons: 25% | 50% | 75%
- `fit` and `withoutEnlargement` are intentionally omitted — percentage scaling doesn't need them. API defaults (`contain`, `false`) are sent.
- Process button at bottom

### Resize: Side-by-Side Result Display

Replace the before/after slider with side-by-side thumbnails:

- Two image thumbnails side by side, each fitted within its half
- **Left**: "Original" label, the original image, dimensions below (e.g., "3000 × 2000"), file size (e.g., "2.4 MB")
- **Right**: "Resized" label, the processed image, new dimensions below (e.g., "1080 × 720"), file size (e.g., "340 KB")
- File size savings shown between/below (e.g., "86% smaller")
- Checkerboard background for transparency (same pattern as current viewer)
- **Dimensions**: Read client-side from blob URLs using `Image.onload` to get `naturalWidth`/`naturalHeight`. No backend changes needed.
- **File sizes**: Use existing `originalSize`/`processedSize` from the API response (already available in the file store).
- **Mobile**: On small screens, thumbnails stack vertically instead of side-by-side.
- Review panel (undo, download, continue editing) remains unchanged

### Rotate/Flip: Live CSS Preview

Replace the "process then compare" flow with live preview:

**State architecture**: `rotate-settings.tsx` emits transform values (angle, flipH, flipV) via a callback prop from `tool-page.tsx`. `tool-page.tsx` holds the preview transform state and passes it down to `ImageViewer` as optional props (`cssRotate`, `cssFlipH`, `cssFlipV`). `ImageViewer` applies these as CSS `transform: rotate(Xdeg) scaleX(Y) scaleY(Z)`.

- When a file is loaded, it shows in the image viewer as normal
- As the user adjusts controls (rotate buttons, angle slider, flip toggles), CSS transforms update the preview in real-time — no server call
- Controls stay the same: quick rotate 90 left/right, angle slider 0-360, horizontal/vertical flip toggles
- **Non-90-degree angles**: CSS preview will clip corners (the image rotates within its container). This is acceptable as a preview — the final server output will have proper canvas extension. This is a known discrepancy.
- The "Process" button label changes to "Apply" to signal finality
- "Apply" button remains disabled when no changes are made (angle=0, no flips) — same as current behavior
- Clicking "Apply" sends to the server, produces the final file

### Rotate/Flip: Result Display

After applying:
- Result shows in the standard ImageViewer (no before/after slider, no side-by-side)
- The transformation is self-evident
- Review panel appears with undo/download options

### Other Tools

The `BeforeAfterSlider` remains for all other tools (compress, filters, etc.). Only resize and rotate/flip get special treatment. In `tool-page.tsx`, branch on `toolId` using a set (e.g., `TOOLS_WITHOUT_SLIDER`) for extensibility.

## Files to Modify

### Frontend
- `apps/web/src/components/tools/resize-settings.tsx` — rewrite with tab-based UI
- `apps/web/src/components/tools/rotate-settings.tsx` — emit transform values via callback, change button label to "Apply"
- `apps/web/src/pages/tool-page.tsx` — hold preview transform state, conditionally render side-by-side for resize, ImageViewer for rotate/flip, BeforeAfterSlider for everything else
- `apps/web/src/components/common/image-viewer.tsx` — accept optional CSS transform props for live rotate/flip preview
- `apps/web/src/components/common/side-by-side-comparison.tsx` — new component for side-by-side thumbnail comparison with dimensions and file size

### No Backend Changes
- Resize and rotate API routes remain unchanged
- Image engine operations remain unchanged
- Only the frontend presentation and interaction model changes
