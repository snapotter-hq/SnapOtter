# Fix HTTP/Non-Secure Context Compatibility

**Date:** 2026-04-04
**Issues:** [#4](https://github.com/stirling-image/stirling-image/issues/4), [#5](https://github.com/stirling-image/stirling-image/issues/5)

## Problem

`crypto.randomUUID()` and `navigator.clipboard.writeText()` are secure-context-only Web APIs. They throw or are undefined when the app is accessed over plain HTTP on non-localhost addresses (e.g., `http://192.168.1.x:1349`). This breaks all tool operations and copy-to-clipboard functionality.

Stirling-Image is a self-hosted tool where many users deploy on NAS/homelab devices over plain HTTP. This must be a first-class supported deployment mode.

## Solution

### Part 1: `generateId()` utility

Add to `apps/web/src/lib/utils.ts`:

```ts
export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

Produces a standard UUID v4 string using `crypto.getRandomValues()`, which is available in all modern browsers regardless of secure context.

**6 call sites replaced** (`crypto.randomUUID()` -> `generateId()`):

| File | Line | Purpose |
|------|------|---------|
| `apps/web/src/hooks/use-tool-processor.ts` | 91 | Single-file job correlation ID |
| `apps/web/src/hooks/use-tool-processor.ts` | 260 | Batch job correlation ID |
| `apps/web/src/components/tools/ocr-settings.tsx` | 52 | OCR job ID |
| `apps/web/src/components/tools/erase-object-settings.tsx` | 52 | Erase object job ID |
| `apps/web/src/components/tools/pipeline-builder.tsx` | 104 | Pipeline step ID |
| `apps/web/src/pages/automate-page.tsx` | 147 | Automation step ID |

### Part 2: `copyToClipboard()` utility

Add to `apps/web/src/lib/utils.ts`:

```ts
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
```

Returns `true`/`false` so callers can decide whether to show a "Copied!" confirmation. On HTTP, the call fails silently and the UI does not show the confirmation. No behavior change for HTTPS/localhost users.

**4 call sites replaced** (`navigator.clipboard.writeText()` -> `copyToClipboard()`):

| File | Line | Current error handling |
|------|------|-----------------------|
| `apps/web/src/components/settings/settings-dialog.tsx` | 1148 | None - needs wrapping |
| `apps/web/src/components/tools/color-palette-settings.tsx` | 47 | Has try-catch, simplify |
| `apps/web/src/components/tools/ocr-settings.tsx` | 120 | None - needs wrapping |
| `apps/web/src/components/tools/barcode-read-settings.tsx` | 48 | Has try-catch, simplify |

## What does NOT change

- Server-side code: Node's `crypto.randomUUID()` works fine outside browsers
- `vitest.config.ts`: Runs in Node, not a browser
- No new dependencies added
- No config file changes

## Testing

- `pnpm typecheck` - verify all imports resolve
- `pnpm lint` - verify Biome formatting
- `pnpm test` - catch regressions
- Manual: access over HTTP on a non-localhost address, confirm tools work

## Alternatives considered

1. **`uuid` npm package** - rejected, adds a dependency for 5 lines of code that does the same thing internally
2. **Try-catch fallback wrapper** (try native `randomUUID()`, fall back to `getRandomValues()`) - rejected, two code paths for zero meaningful performance benefit
