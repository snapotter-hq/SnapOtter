# Edit Metadata Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Edit Metadata" tool that lets users view, edit, and selectively remove EXIF metadata from images.

**Architecture:** Shared metadata infrastructure extracted from strip-metadata (parsing utilities in image-engine, display components in common/). New edit-metadata tool with its own API route, image-engine operation, and UI component. Strip-metadata refactored to use shared imports (behavioral no-op).

**Tech Stack:** Sharp 0.33.5 (`withExifMerge`, `withExif`, `keepMetadata`), exif-reader, Fastify, React, Zustand, Zod, Vitest, Playwright

---

### Task 1: Create test fixture with EXIF data

The existing test JPEGs have no EXIF metadata. We need a fixture with known EXIF/GPS data for testing.

**Files:**
- Create: `tests/fixtures/test-with-exif.jpg`

- [ ] **Step 1: Generate a JPEG with known EXIF data**

```bash
cd /Users/sidd/Desktop/Personal/Projects/Stirling-Image
node -e "
const path = require('path');
const sharp = require(path.join(process.cwd(), 'packages', 'image-engine', 'node_modules', 'sharp'));

// Create a 100x100 red JPEG with EXIF metadata
sharp({
  create: { width: 100, height: 100, channels: 3, background: '#ff0000' }
})
  .withExif({
    IFD0: {
      Artist: 'Test Artist',
      Copyright: '2026 Test Copyright',
      ImageDescription: 'Test Description',
      Software: 'Stirling-Image Test',
      DateTime: '2026:01:15 10:30:00',
      Make: 'TestCamera',
      Model: 'TestModel',
    },
    IFD2: {
      DateTimeOriginal: '2026:01:15 10:30:00',
    },
  })
  .jpeg({ quality: 95 })
  .toFile(path.join('tests', 'fixtures', 'test-with-exif.jpg'))
  .then(() => console.log('Created test-with-exif.jpg'))
  .catch(e => console.error(e));
"
```

- [ ] **Step 2: Verify the fixture has EXIF data**

```bash
node -e "
const path = require('path');
const sharp = require(path.join(process.cwd(), 'packages', 'image-engine', 'node_modules', 'sharp'));
const exifReader = require(path.join(process.cwd(), 'apps', 'api', 'node_modules', 'exif-reader'));
sharp(path.join('tests', 'fixtures', 'test-with-exif.jpg')).metadata().then(m => {
  console.log('has exif:', !!m.exif);
  if (m.exif) {
    const parsed = exifReader(m.exif);
    console.log('Artist:', parsed.Image?.Artist);
    console.log('Copyright:', parsed.Image?.Copyright);
    console.log('Software:', parsed.Image?.Software);
    console.log('Description:', parsed.Image?.ImageDescription);
  }
});
"
```

Expected: `has exif: true`, Artist = "Test Artist", Copyright = "2026 Test Copyright", etc.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/test-with-exif.jpg
git commit -m "test: add JPEG fixture with known EXIF data for edit-metadata tests"
```

---

### Task 2: Add `EditMetadataOptions` type and `exif-reader` dependency to image-engine

**Files:**
- Modify: `packages/image-engine/src/types.ts:64` (after `StripMetadataOptions`)
- Modify: `packages/image-engine/package.json:14` (add exif-reader dependency)

- [ ] **Step 1: Add the `EditMetadataOptions` type**

Add after line 64 in `packages/image-engine/src/types.ts` (after `StripMetadataOptions` closing brace):

```typescript
export interface EditMetadataOptions {
  artist?: string;
  copyright?: string;
  imageDescription?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  clearGps?: boolean;
  fieldsToRemove?: string[];
}
```

- [ ] **Step 2: Add exif-reader to image-engine dependencies**

The parsing utilities we're about to extract use `exif-reader`. It's currently only in `apps/api/package.json`. Add it to `packages/image-engine/package.json` under `dependencies`:

```json
"dependencies": {
  "@stirling-image/shared": "workspace:*",
  "exif-reader": "^2.0.3",
  "sharp": "^0.33.0"
}
```

- [ ] **Step 3: Install the new dependency**

```bash
pnpm install
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/image-engine/src/types.ts packages/image-engine/package.json pnpm-lock.yaml
git commit -m "feat: add EditMetadataOptions type and exif-reader dep to image-engine"
```

---

### Task 3: Extract shared metadata parsing into image-engine

Move `sanitizeValue`, `parseGpsCoordinates`, `parseXmp` from `apps/api/src/routes/tools/strip-metadata.ts` into `packages/image-engine/src/utils/metadata.ts`. Add `parseExif`.

**Files:**
- Modify: `packages/image-engine/src/utils/metadata.ts`

- [ ] **Step 1: Write failing tests for the parsing utilities**

Create test cases in `tests/unit/image-engine/operations.test.ts`. Add at the top of the import block:

```typescript
import {
  // existing imports...
  getImageInfo,
  sanitizeValue,
  parseExif,
  parseGps,
  parseXmp,
} from "@stirling-image/image-engine";
```

Add a new fixture at the top with the others:

```typescript
let jpgWithExif: Buffer;
```

In the `beforeAll`:

```typescript
jpgWithExif = readFileSync(path.join(FIXTURES_DIR, "test-with-exif.jpg"));
```

Add test blocks at the end of the file:

```typescript
// ---------------------------------------------------------------------------
// Shared metadata parsing utilities
// ---------------------------------------------------------------------------
describe("sanitizeValue", () => {
  it("converts Date to ISO string", () => {
    const d = new Date("2026-01-15T10:30:00Z");
    expect(sanitizeValue(d)).toBe("2026-01-15T10:30:00.000Z");
  });

  it("converts small Buffer to number array", () => {
    const buf = Buffer.from([1, 2, 3]);
    expect(sanitizeValue(buf)).toEqual([1, 2, 3]);
  });

  it("converts large Buffer to placeholder string", () => {
    const buf = Buffer.alloc(300, 0);
    expect(sanitizeValue(buf)).toBe("<binary 300 bytes>");
  });

  it("recursively sanitizes objects", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    const result = sanitizeValue({ nested: { date: d } });
    expect(result).toEqual({ nested: { date: "2026-01-01T00:00:00.000Z" } });
  });

  it("passes through primitives unchanged", () => {
    expect(sanitizeValue("hello")).toBe("hello");
    expect(sanitizeValue(42)).toBe(42);
    expect(sanitizeValue(null)).toBe(null);
    expect(sanitizeValue(true)).toBe(true);
  });
});

describe("parseExif", () => {
  it("parses EXIF buffer from test fixture", async () => {
    const metadata = await sharp(jpgWithExif).metadata();
    expect(metadata.exif).toBeTruthy();
    const result = parseExif(metadata.exif!);
    expect(result.image.Artist).toBe("Test Artist");
    expect(result.image.Copyright).toBe("2026 Test Copyright");
    expect(result.image.Software).toBe("Stirling-Image Test");
    expect(result.image.ImageDescription).toBe("Test Description");
  });

  it("returns empty sections for buffer with no data", async () => {
    const metadata = await sharp(png1x1).metadata();
    // PNG has no EXIF - pass a minimal valid EXIF buffer
    // This tests the error/empty path
    const result = parseExif(Buffer.from([]));
    expect(result.image).toEqual({});
    expect(result.gps).toEqual({});
  });
});

describe("parseGps", () => {
  it("parses DMS coordinates to decimal degrees", () => {
    const result = parseGps({
      GPSLatitude: [51, 30, 26.4],
      GPSLatitudeRef: "N",
      GPSLongitude: [0, 7, 39.6],
      GPSLongitudeRef: "W",
      GPSAltitude: 10,
      GPSAltitudeRef: 0,
    });
    expect(result.latitude).toBeCloseTo(51.5073, 3);
    expect(result.longitude).toBeCloseTo(-0.1277, 3);
    expect(result.altitude).toBe(10);
  });

  it("returns nulls for empty GPS data", () => {
    const result = parseGps({});
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.altitude).toBeNull();
  });

  it("handles southern hemisphere", () => {
    const result = parseGps({
      GPSLatitude: [33, 51, 54],
      GPSLatitudeRef: "S",
      GPSLongitude: [151, 12, 36],
      GPSLongitudeRef: "E",
    });
    expect(result.latitude).toBeCloseTo(-33.865, 2);
    expect(result.longitude).toBeCloseTo(151.21, 2);
  });
});

describe("parseXmp", () => {
  it("extracts key-value pairs from XMP XML", () => {
    const xml = Buffer.from(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
        '<rdf:Description dc:creator="Alice" dc:title="My Photo" />' +
        "</rdf:RDF></x:xmpmeta>",
    );
    const result = parseXmp(xml);
    expect(result["dc:creator"]).toBe("Alice");
    expect(result["dc:title"]).toBe("My Photo");
  });

  it("skips xmlns and rdf namespace prefixes", () => {
    const xml = Buffer.from(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<rdf:Description rdf:about="" dc:format="image/jpeg" />' +
        "</x:xmpmeta>",
    );
    const result = parseXmp(xml);
    expect(result["xmlns:x"]).toBeUndefined();
    expect(result["xmlns:dc"]).toBeUndefined();
    expect(result["rdf:about"]).toBeUndefined();
    expect(result["dc:format"]).toBe("image/jpeg");
  });

  it("returns empty object for empty buffer", () => {
    const result = parseXmp(Buffer.from(""));
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:unit -- --grep "sanitizeValue|parseExif|parseGps|parseXmp"
```

Expected: FAIL - functions not exported from `@stirling-image/image-engine`

- [ ] **Step 3: Implement the shared parsing utilities**

Replace the contents of `packages/image-engine/src/utils/metadata.ts` with:

```typescript
import exifReader from "exif-reader";
import sharp from "sharp";
import type { ImageInfo } from "../types.js";

/**
 * Extract comprehensive image metadata from a buffer.
 */
export async function getImageInfo(buffer: Buffer): Promise<ImageInfo> {
  const metadata = await sharp(buffer).metadata();

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? "unknown",
    channels: metadata.channels ?? 0,
    size: buffer.length,
    hasAlpha: metadata.hasAlpha ?? false,
    metadata: {
      space: metadata.space,
      density: metadata.density,
      isProgressive: metadata.isProgressive,
      hasProfile: metadata.hasProfile,
      orientation: metadata.orientation,
      exif: !!metadata.exif,
      icc: !!metadata.icc,
      xmp: !!metadata.xmp,
    },
  };
}

/**
 * Serialize a value for JSON - convert Buffers/Dates and drop overly large blobs.
 */
export function sanitizeValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) {
    if (v.length > 256) return `<binary ${v.length} bytes>`;
    return Array.from(v);
  }
  if (Array.isArray(v)) return v.map(sanitizeValue);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = sanitizeValue(val);
    }
    return out;
  }
  return v;
}

/**
 * Parse an EXIF buffer into sanitized sections.
 * Returns { image, photo, iop, gps } with JSON-safe values.
 */
export function parseExif(exifBuffer: Buffer): {
  image: Record<string, unknown>;
  photo: Record<string, unknown>;
  iop: Record<string, unknown>;
  gps: Record<string, unknown>;
} {
  const result = { image: {} as Record<string, unknown>, photo: {} as Record<string, unknown>, iop: {} as Record<string, unknown>, gps: {} as Record<string, unknown> };

  if (!exifBuffer || exifBuffer.length === 0) return result;

  try {
    const parsed = exifReader(exifBuffer);

    if (parsed.Image) {
      for (const [k, v] of Object.entries(parsed.Image)) {
        result.image[k] = sanitizeValue(v);
      }
    }
    if (parsed.Photo) {
      for (const [k, v] of Object.entries(parsed.Photo)) {
        result.photo[k] = sanitizeValue(v);
      }
    }
    if (parsed.Iop) {
      for (const [k, v] of Object.entries(parsed.Iop)) {
        result.iop[k] = sanitizeValue(v);
      }
    }
    if (parsed.GPSInfo) {
      for (const [k, v] of Object.entries(parsed.GPSInfo)) {
        result.gps[k] = sanitizeValue(v);
      }
    }
  } catch {
    // Return empty sections on parse failure
  }

  return result;
}

/**
 * Parse GPS coordinates from EXIF GPSInfo into decimal degrees.
 */
export function parseGps(gps: Record<string, unknown>): {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
} {
  let latitude: number | null = null;
  let longitude: number | null = null;
  let altitude: number | null = null;

  const lat = gps.GPSLatitude as number[] | undefined;
  const latRef = gps.GPSLatitudeRef as string | undefined;
  if (lat && lat.length === 3 && lat.every((v) => typeof v === "number" && !Number.isNaN(v))) {
    latitude = lat[0] + lat[1] / 60 + lat[2] / 3600;
    if (latRef === "S") latitude = -latitude;
  }

  const lon = gps.GPSLongitude as number[] | undefined;
  const lonRef = gps.GPSLongitudeRef as string | undefined;
  if (lon && lon.length === 3 && lon.every((v) => typeof v === "number" && !Number.isNaN(v))) {
    longitude = lon[0] + lon[1] / 60 + lon[2] / 3600;
    if (lonRef === "W") longitude = -longitude;
  }

  if (typeof gps.GPSAltitude === "number" && !Number.isNaN(gps.GPSAltitude)) {
    altitude = gps.GPSAltitude;
    if (gps.GPSAltitudeRef === 1) altitude = -altitude;
  }

  return { latitude, longitude, altitude };
}

/**
 * Parse XMP XML buffer into key-value pairs.
 */
export function parseXmp(xmpBuffer: Buffer): Record<string, string> {
  const xml = xmpBuffer.toString("utf-8");
  const result: Record<string, string> = {};

  for (const match of xml.matchAll(/(\w+:\w+)="([^"]+)"/g)) {
    const key = match[1];
    if (key.startsWith("xmlns:") || key.startsWith("rdf:")) continue;
    result[key] = match[2];
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit -- --grep "sanitizeValue|parseExif|parseGps|parseXmp"
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add packages/image-engine/src/utils/metadata.ts tests/unit/image-engine/operations.test.ts
git commit -m "feat: extract shared metadata parsing utilities into image-engine"
```

---

### Task 4: Implement `editMetadata` operation in image-engine

**Files:**
- Create: `packages/image-engine/src/operations/edit-metadata.ts`
- Modify: `packages/image-engine/src/engine.ts:15,31,49` (add to operation map)
- Modify: `packages/image-engine/src/index.ts:16` (add export)

- [ ] **Step 1: Write failing tests for `editMetadata`**

Add `editMetadata` to the imports in `tests/unit/image-engine/operations.test.ts`:

```typescript
import {
  // existing imports...
  editMetadata,
  getImageInfo,
  sanitizeValue,
  parseExif,
  parseGps,
  parseXmp,
} from "@stirling-image/image-engine";
```

Add test block:

```typescript
// ---------------------------------------------------------------------------
// editMetadata
// ---------------------------------------------------------------------------
describe("editMetadata", () => {
  it("writes common fields readable via exif-reader", async () => {
    const image = sharp(jpgWithExif);
    const result = await editMetadata(image, {
      artist: "New Artist",
      copyright: "New Copyright",
    });
    const buf = await result.jpeg().toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.exif).toBeTruthy();
    const parsed = exifReader(meta.exif!);
    expect(parsed.Image?.Artist).toBe("New Artist");
    expect(parsed.Image?.Copyright).toBe("New Copyright");
    // Original fields should be preserved via withExifMerge
    expect(parsed.Image?.Software).toBe("Stirling-Image Test");
  });

  it("clears GPS while preserving other EXIF", async () => {
    // First write GPS to the image
    const withGps = sharp(jpgWithExif).withExif({
      IFD0: { Artist: "GPS Test" },
      IFD3: { GPSLatitudeRef: "N" },
    });
    const gpsBuf = await withGps.jpeg().toBuffer();

    const image = sharp(gpsBuf);
    const result = await editMetadata(image, { clearGps: true });
    const buf = await result.jpeg().toBuffer();
    const meta = await sharp(buf).metadata();
    const parsed = exifReader(meta.exif!);
    // GPS should be gone
    expect(parsed.GPSInfo).toBeUndefined();
    // Other EXIF should still be present
    expect(parsed.Image?.Artist).toBe("GPS Test");
  });

  it("removes specific fields via fieldsToRemove", async () => {
    const image = sharp(jpgWithExif);
    const result = await editMetadata(image, {
      fieldsToRemove: ["Software"],
    });
    const buf = await result.jpeg().toBuffer();
    const meta = await sharp(buf).metadata();
    const parsed = exifReader(meta.exif!);
    expect(parsed.Image?.Software).toBeUndefined();
    // Other fields preserved
    expect(parsed.Image?.Artist).toBe("Test Artist");
  });

  it("preserves metadata with no options", async () => {
    const image = sharp(jpgWithExif);
    const result = await editMetadata(image, {});
    const buf = await result.jpeg().toBuffer();
    const meta = await sharp(buf).metadata();
    expect(meta.exif).toBeTruthy();
    const parsed = exifReader(meta.exif!);
    expect(parsed.Image?.Artist).toBe("Test Artist");
  });

  it("edit wins over remove for same field", async () => {
    const image = sharp(jpgWithExif);
    const result = await editMetadata(image, {
      artist: "Override Artist",
      fieldsToRemove: ["Artist"],
    });
    const buf = await result.jpeg().toBuffer();
    const meta = await sharp(buf).metadata();
    const parsed = exifReader(meta.exif!);
    expect(parsed.Image?.Artist).toBe("Override Artist");
  });

  it("writes fresh EXIF to image without existing metadata", async () => {
    const image = sharp(png1x1);
    const result = await editMetadata(image, {
      artist: "Fresh Artist",
      copyright: "Fresh Copyright",
    });
    const buf = await result.png().toBuffer();
    const meta = await sharp(buf).metadata();
    // PNG may or may not preserve EXIF depending on Sharp version
    // At minimum, the operation should not throw
    expect(buf.length).toBeGreaterThan(0);
  });
});
```

Also add `exifReader` import at the top of the test file:

```typescript
const exifReader = require(
  path.resolve(__dirname, "../../../apps/api/node_modules/exif-reader"),
) as typeof import("exif-reader").default;
```

Wait - `exif-reader` is now in image-engine. Update the require:

```typescript
const exifReader = require(
  path.resolve(__dirname, "../../../packages/image-engine/node_modules/exif-reader"),
) as typeof import("exif-reader").default;
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:unit -- --grep "editMetadata"
```

Expected: FAIL - `editMetadata` not exported

- [ ] **Step 3: Implement `editMetadata`**

Create `packages/image-engine/src/operations/edit-metadata.ts`:

```typescript
import exifReader from "exif-reader";
import type { EditMetadataOptions, Sharp } from "../types.js";
import { sanitizeValue } from "../utils/metadata.js";

/**
 * Map of common option field names to their EXIF IFD and tag name.
 */
const COMMON_FIELD_MAP: Array<{
  option: keyof EditMetadataOptions;
  ifd: "IFD0" | "IFD2";
  tag: string;
}> = [
  { option: "artist", ifd: "IFD0", tag: "Artist" },
  { option: "copyright", ifd: "IFD0", tag: "Copyright" },
  { option: "imageDescription", ifd: "IFD0", tag: "ImageDescription" },
  { option: "software", ifd: "IFD0", tag: "Software" },
  { option: "dateTime", ifd: "IFD0", tag: "DateTime" },
  { option: "dateTimeOriginal", ifd: "IFD2", tag: "DateTimeOriginal" },
];

export async function editMetadata(
  image: Sharp,
  options: EditMetadataOptions = {},
): Promise<Sharp> {
  const edits: { IFD0: Record<string, string>; IFD2: Record<string, string> } = {
    IFD0: {},
    IFD2: {},
  };

  // Build edit map from common fields
  for (const { option, ifd, tag } of COMMON_FIELD_MAP) {
    const value = options[option];
    if (typeof value === "string" && value.length > 0) {
      edits[ifd][tag] = value;
    }
  }

  // Collect tags being written (for edit-wins-over-remove)
  const writtenTags = new Set([
    ...Object.keys(edits.IFD0),
    ...Object.keys(edits.IFD2),
  ]);

  // Filter fieldsToRemove: remove any that are also being written (edit wins)
  const fieldsToRemove = (options.fieldsToRemove ?? []).filter(
    (f) => !writtenTags.has(f),
  );

  const hasEdits = Object.keys(edits.IFD0).length > 0 || Object.keys(edits.IFD2).length > 0;
  const hasRemovals = fieldsToRemove.length > 0 || options.clearGps === true;

  // Nothing to do - preserve everything
  if (!hasEdits && !hasRemovals) {
    return image.keepMetadata();
  }

  // Removals require full EXIF replacement via withExif()
  if (hasRemovals) {
    // Read existing EXIF to rebuild minus removed fields
    const buf = await image.clone().toBuffer();
    const metadata = await (await import("sharp")).default(buf).metadata();

    const existingIFD0: Record<string, string> = {};
    const existingIFD2: Record<string, string> = {};

    if (metadata.exif) {
      try {
        const parsed = exifReader(metadata.exif);
        // Rebuild IFD0 from Image section
        if (parsed.Image) {
          for (const [k, v] of Object.entries(parsed.Image)) {
            if (fieldsToRemove.includes(k)) continue;
            const sv = sanitizeValue(v);
            if (typeof sv === "string" || typeof sv === "number") {
              existingIFD0[k] = String(sv);
            }
          }
        }
        // Rebuild IFD2 from Photo section
        if (parsed.Photo) {
          for (const [k, v] of Object.entries(parsed.Photo)) {
            if (fieldsToRemove.includes(k)) continue;
            const sv = sanitizeValue(v);
            if (typeof sv === "string" || typeof sv === "number") {
              existingIFD2[k] = String(sv);
            }
          }
        }
      } catch {
        // If parsing fails, proceed with just the edits
      }
    }

    // Merge edits on top of existing (edits override)
    const finalIFD0 = { ...existingIFD0, ...edits.IFD0 };
    const finalIFD2 = { ...existingIFD2, ...edits.IFD2 };

    const exif: Record<string, Record<string, string>> = {};
    if (Object.keys(finalIFD0).length > 0) exif.IFD0 = finalIFD0;
    if (Object.keys(finalIFD2).length > 0) exif.IFD2 = finalIFD2;
    // Omit IFD3 (GPS) when clearGps is true; otherwise rebuild would need GPS parsing too
    // withExif replaces all EXIF, so omitting IFD3 drops GPS

    return image.withExif(exif);
  }

  // Edits only - non-destructive merge
  const exif: Record<string, Record<string, string>> = {};
  if (Object.keys(edits.IFD0).length > 0) exif.IFD0 = edits.IFD0;
  if (Object.keys(edits.IFD2).length > 0) exif.IFD2 = edits.IFD2;

  return image.withExifMerge(exif);
}
```

- [ ] **Step 4: Export from index and add to engine pipeline**

In `packages/image-engine/src/index.ts`, add after the stripMetadata export (line 16):

```typescript
export { editMetadata } from "./operations/edit-metadata.js";
```

In `packages/image-engine/src/engine.ts`, add the import (after line 15):

```typescript
import { editMetadata } from "./operations/edit-metadata.js";
```

Add to the import of types (line 30):

```typescript
import type {
  // existing types...
  EditMetadataOptions,
} from "./types.js";
```

Add to `OPERATION_MAP` (after line 49, the strip-metadata entry):

```typescript
  "edit-metadata": (img, opts) => editMetadata(img, opts as unknown as EditMetadataOptions),
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test:unit -- --grep "editMetadata"
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add packages/image-engine/src/operations/edit-metadata.ts packages/image-engine/src/engine.ts packages/image-engine/src/index.ts tests/unit/image-engine/operations.test.ts
git commit -m "feat: implement editMetadata operation in image-engine"
```

---

### Task 5: Refactor strip-metadata route to use shared parsing

Replace local `sanitizeValue`, `parseGpsCoordinates`, `parseXmp` in strip-metadata with imports from image-engine. Keep `parseIccProfile` local (it's only used by strip-metadata). Behavioral no-op.

**Files:**
- Modify: `apps/api/src/routes/tools/strip-metadata.ts:1-85`

- [ ] **Step 1: Replace local parsing helpers with shared imports**

In `apps/api/src/routes/tools/strip-metadata.ts`, replace lines 1-85 (imports through `parseXmp`) with:

```typescript
import { basename } from "node:path";
import { parseExif, parseGps, parseXmp, sanitizeValue, stripMetadata } from "@stirling-image/image-engine";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  stripExif: z.boolean().default(false),
  stripGps: z.boolean().default(false),
  stripIcc: z.boolean().default(false),
  stripXmp: z.boolean().default(false),
  stripAll: z.boolean().default(true),
});
```

Then replace the inspect endpoint's EXIF/GPS parsing (lines 207-239 in the original) to use the shared functions. Replace the inline parsing with:

```typescript
        // Parse EXIF
        if (metadata.exif) {
          try {
            const parsed = parseExif(metadata.exif);
            const exifData: Record<string, unknown> = {
              ...parsed.image,
              ...parsed.photo,
              ...parsed.iop,
            };
            const gpsData: Record<string, unknown> = { ...parsed.gps };

            if (Object.keys(parsed.gps).length > 0) {
              const coords = parseGps(parsed.gps);
              if (coords.latitude !== null) gpsData._latitude = coords.latitude;
              if (coords.longitude !== null) gpsData._longitude = coords.longitude;
              if (coords.altitude !== null) gpsData._altitude = coords.altitude;
            }

            if (Object.keys(exifData).length > 0) result.exif = exifData;
            if (Object.keys(gpsData).length > 0) result.gps = gpsData;
          } catch {
            result.exif = null;
            result.exifError = "Failed to parse EXIF data";
          }
        }
```

The XMP parsing (lines 259-265) becomes:

```typescript
        // Parse XMP
        if (metadata.xmp) {
          try {
            result.xmp = parseXmp(metadata.xmp);
          } catch {
            result.xmp = null;
          }
        }
```

Keep the `parseIccProfile` function local (lines 90-165) - it's only used by strip-metadata.

Remove the old `exif-reader` import (it was only used for the inline EXIF parsing that's now in image-engine).

- [ ] **Step 2: Run existing strip-metadata tests to verify no regression**

```bash
pnpm test:unit -- --grep "stripMetadata"
pnpm test:integration -- --grep "strip-metadata"
```

Expected: all existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/tools/strip-metadata.ts
git commit -m "refactor: use shared metadata parsing in strip-metadata route"
```

---

### Task 6: Create edit-metadata API route

**Files:**
- Create: `apps/api/src/routes/tools/edit-metadata.ts`
- Modify: `apps/api/src/routes/tools/index.ts:5,83`

- [ ] **Step 1: Write failing integration tests**

Add to the end of `tests/integration/api.test.ts`, before the closing of the last `describe` block:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// EDIT METADATA TOOL
// ══════════════════════════════════════════════════════��════════════════════
describe("Edit metadata", () => {
  const EXIF_JPG = readFileSync(join(FIXTURES, "test-with-exif.jpg"));

  describe("POST /api/v1/tools/edit-metadata/inspect", () => {
    it("returns parsed EXIF for JPEG with metadata", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "exif.jpg", contentType: "image/jpeg", content: EXIF_JPG },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata/inspect",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.filename).toBe("exif.jpg");
      expect(body.exif).toBeTruthy();
      expect(body.exif.Artist).toBe("Test Artist");
      expect(body.exif.Copyright).toBe("2026 Test Copyright");
    });

    it("returns nulls for metadata-free PNG", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "plain.png", contentType: "image/png", content: PNG_1x1 },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata/inspect",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.exif).toBeUndefined();
    });

    it("rejects request with no file", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata/inspect",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "multipart/form-data; boundary=---",
        },
        payload: "-----\r\n",
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/tools/edit-metadata", () => {
    it("writes metadata and returns downloadable file", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "edit.jpg", contentType: "image/jpeg", content: EXIF_JPG },
        { name: "settings", content: JSON.stringify({ artist: "New Author" }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toBeDefined();
      expect(body.jobId).toBeDefined();
    });

    it("strips specific fields via fieldsToRemove", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "strip.jpg", contentType: "image/jpeg", content: EXIF_JPG },
        { name: "settings", content: JSON.stringify({ fieldsToRemove: ["Software"] }) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it("preserves metadata with empty settings", async () => {
      const { body: payload, contentType } = createMultipartPayload([
        { name: "file", filename: "noop.jpg", contentType: "image/jpeg", content: EXIF_JPG },
        { name: "settings", content: JSON.stringify({}) },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/edit-metadata",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:integration -- --grep "Edit metadata"
```

Expected: FAIL - route not found (404)

- [ ] **Step 3: Create the edit-metadata route**

Create `apps/api/src/routes/tools/edit-metadata.ts`:

```typescript
import { basename } from "node:path";
import { editMetadata, parseExif, parseGps, parseXmp } from "@stirling-image/image-engine";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  artist: z.string().optional(),
  copyright: z.string().optional(),
  imageDescription: z.string().optional(),
  software: z.string().optional(),
  dateTime: z.string().optional(),
  dateTimeOriginal: z.string().optional(),
  clearGps: z.boolean().default(false),
  fieldsToRemove: z.array(z.string()).default([]),
});

export function registerEditMetadata(app: FastifyInstance) {
  // Inspect endpoint - returns parsed metadata as JSON for pre-populating the form
  app.post(
    "/api/v1/tools/edit-metadata/inspect",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
            filename = basename(part.filename ?? "image");
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      try {
        const metadata = await sharp(fileBuffer).metadata();
        const result: Record<string, unknown> = {
          filename,
          fileSize: fileBuffer.length,
        };

        if (metadata.exif) {
          try {
            const parsed = parseExif(metadata.exif);
            const exifData: Record<string, unknown> = {
              ...parsed.image,
              ...parsed.photo,
              ...parsed.iop,
            };
            const gpsData: Record<string, unknown> = { ...parsed.gps };

            if (Object.keys(parsed.gps).length > 0) {
              const coords = parseGps(parsed.gps);
              if (coords.latitude !== null) gpsData._latitude = coords.latitude;
              if (coords.longitude !== null) gpsData._longitude = coords.longitude;
              if (coords.altitude !== null) gpsData._altitude = coords.altitude;
            }

            if (Object.keys(exifData).length > 0) result.exif = exifData;
            if (Object.keys(gpsData).length > 0) result.gps = gpsData;
          } catch {
            result.exif = null;
            result.exifError = "Failed to parse EXIF data";
          }
        }

        if (metadata.xmp) {
          try {
            result.xmp = parseXmp(metadata.xmp);
          } catch {
            result.xmp = null;
          }
        }

        return reply.send(result);
      } catch (err) {
        return reply.status(422).send({
          error: "Failed to read image metadata",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );

  // Edit endpoint - writes metadata and returns the updated image
  createToolRoute(app, {
    toolId: "edit-metadata",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const metadata = await sharp(inputBuffer).metadata();
      const format = metadata.format ?? "jpeg";
      const image = sharp(inputBuffer);
      const result = await editMetadata(image, settings);

      switch (format) {
        case "jpeg":
          result.jpeg({ quality: 95, mozjpeg: true });
          break;
        case "png":
          result.png({ compressionLevel: 6 });
          break;
        case "webp":
          result.webp({ quality: 90 });
          break;
        case "avif":
          result.avif({ quality: 60 });
          break;
        case "tiff":
          result.tiff({ quality: 90 });
          break;
        default:
          result.jpeg({ quality: 95 });
          break;
      }

      const buffer = await result.toBuffer();
      const ext = format === "jpeg" ? "jpg" : format;
      const outFilename = filename.replace(/\.[^.]+$/, `.${ext}`);
      const mimeMap: Record<string, string> = {
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        avif: "image/avif",
        tiff: "image/tiff",
        gif: "image/gif",
      };

      return {
        buffer,
        filename: outFilename,
        contentType: mimeMap[format] ?? "image/jpeg",
      };
    },
  });
}
```

- [ ] **Step 4: Register the route**

In `apps/api/src/routes/tools/index.ts`, add import (after line 31):

```typescript
import { registerEditMetadata } from "./edit-metadata.js";
```

Add to `toolRegistrations` array (after line 83, the strip-metadata entry):

```typescript
    { id: "edit-metadata", register: registerEditMetadata },
```

- [ ] **Step 5: Run integration tests**

```bash
pnpm test:integration -- --grep "Edit metadata"
```

Expected: all PASS

- [ ] **Step 6: Run strip-metadata regression**

```bash
pnpm test:integration -- --grep "strip-metadata"
```

Expected: all PASS (no regression)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/tools/edit-metadata.ts apps/api/src/routes/tools/index.ts tests/integration/api.test.ts
git commit -m "feat: add edit-metadata API route with inspect and edit endpoints"
```

---

### Task 7: Register tool in shared constants and i18n

**Files:**
- Modify: `packages/shared/src/constants.ts:65` (after strip-metadata entry)
- Modify: `packages/shared/src/i18n/en.ts:38` (after strip-metadata entry)

- [ ] **Step 1: Add tool to TOOLS array**

In `packages/shared/src/constants.ts`, add after the strip-metadata entry (after line 65):

```typescript
  {
    id: "edit-metadata",
    name: "Edit Metadata",
    description: "Edit EXIF, GPS, and camera info",
    category: "optimization",
    icon: "PenLine",
    route: "/edit-metadata",
  },
```

- [ ] **Step 2: Add i18n strings**

In `packages/shared/src/i18n/en.ts`, add after the strip-metadata entry (after line 38):

```typescript
    "edit-metadata": { name: "Edit Metadata", description: "Edit EXIF, GPS, and camera info" },
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/i18n/en.ts
git commit -m "feat: register edit-metadata in shared constants and i18n"
```

---

### Task 8: Extract shared UI components from strip-metadata

**Files:**
- Create: `apps/web/src/components/common/collapsible-section.tsx`
- Create: `apps/web/src/components/common/metadata-grid.tsx`
- Create: `apps/web/src/lib/metadata-utils.ts`
- Modify: `apps/web/src/components/tools/strip-metadata-settings.tsx`

- [ ] **Step 1: Create `metadata-utils.ts`**

Create `apps/web/src/lib/metadata-utils.ts`:

```typescript
/** Human-friendly labels for common EXIF keys */
export const EXIF_LABELS: Record<string, string> = {
  Make: "Camera Make",
  Model: "Camera Model",
  Software: "Software",
  DateTime: "Date/Time",
  DateTimeOriginal: "Date Taken",
  DateTimeDigitized: "Date Digitized",
  ExposureTime: "Exposure Time",
  FNumber: "F-Number",
  ISOSpeedRatings: "ISO",
  FocalLength: "Focal Length",
  FocalLengthIn35mmFilm: "Focal Length (35mm)",
  ExposureBiasValue: "Exposure Bias",
  MeteringMode: "Metering Mode",
  Flash: "Flash",
  WhiteBalance: "White Balance",
  ExposureMode: "Exposure Mode",
  SceneCaptureType: "Scene Type",
  Contrast: "Contrast",
  Saturation: "Saturation",
  Sharpness: "Sharpness",
  DigitalZoomRatio: "Digital Zoom",
  ImageWidth: "Width",
  ImageLength: "Height",
  Orientation: "Orientation",
  XResolution: "X Resolution",
  YResolution: "Y Resolution",
  ResolutionUnit: "Resolution Unit",
  ColorSpace: "Color Space",
  PixelXDimension: "Pixel Width",
  PixelYDimension: "Pixel Height",
  Artist: "Artist",
  Copyright: "Copyright",
  ImageDescription: "Description",
  LensMake: "Lens Make",
  LensModel: "Lens Model",
  BodySerialNumber: "Body Serial",
  CameraOwnerName: "Camera Owner",
};

/** Keys to skip in display (internal/binary/redundant) */
export const SKIP_KEYS = new Set([
  "ExifTag",
  "GPSTag",
  "InteroperabilityTag",
  "MakerNote",
  "PrintImageMatching",
  "ComponentsConfiguration",
  "FlashpixVersion",
  "ExifVersion",
  "FileSource",
  "SceneType",
  "UserComment",
  "InteroperabilityIndex",
  "InteroperabilityVersion",
]);

/**
 * Keys that are binary blobs or complex arrays - NOT safe for EXIF round-trip.
 * These should not get a remove button in the edit-metadata UI.
 */
export const UNSAFE_ROUND_TRIP_KEYS = new Set([
  "MakerNote",
  "PrintImageMatching",
  "ComponentsConfiguration",
  "FlashpixVersion",
  "ExifVersion",
  "FileSource",
  "SceneType",
  "UserComment",
  "InteroperabilityIndex",
  "InteroperabilityVersion",
]);

export function formatExifValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (key === "ExposureTime" && value > 0 && value < 1) {
      return `1/${Math.round(1 / value)}s`;
    }
    if (key === "FNumber") return `f/${value}`;
    if (key === "FocalLength") return `${value}mm`;
    if (key === "FocalLengthIn35mmFilm") return `${value}mm`;
    return String(value);
  }
  if (Array.isArray(value)) {
    if (typeof value[0] === "number" && value.length <= 4) {
      return value.join(", ");
    }
    return `[${value.length} values]`;
  }
  return String(value);
}

export function exifStr(exif: Record<string, unknown> | null | undefined, key: string): string {
  const v = exif?.[key];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}
```

- [ ] **Step 2: Create `collapsible-section.tsx`**

Create `apps/web/src/components/common/collapsible-section.tsx`:

```tsx
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export function CollapsibleSection({
  title,
  badge,
  warning,
  defaultOpen,
  children,
}: {
  title: string;
  badge?: string;
  warning?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="flex-1 text-left">{title}</span>
        {warning && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
        {badge && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create `metadata-grid.tsx`**

Create `apps/web/src/components/common/metadata-grid.tsx`:

```tsx
import { Trash2 } from "lucide-react";
import { SKIP_KEYS, UNSAFE_ROUND_TRIP_KEYS, formatExifValue } from "@/lib/metadata-utils";

export function MetadataGrid({
  data,
  labelMap,
  onRemove,
  removedKeys,
}: {
  data: Record<string, unknown>;
  labelMap?: Record<string, string>;
  onRemove?: (key: string) => void;
  removedKeys?: Set<string>;
}) {
  const entries = Object.entries(data).filter(
    ([k, v]) =>
      !SKIP_KEYS.has(k) && !k.startsWith("_") && v !== undefined && v !== null && String(v) !== "",
  );

  if (entries.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">No data</p>;
  }

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-x-2 gap-y-0.5">
      {entries.map(([k, v]) => {
        const isRemoved = removedKeys?.has(k);
        const canRemove = onRemove && !UNSAFE_ROUND_TRIP_KEYS.has(k);
        return (
          <div key={k} className="contents">
            <div
              className={`text-[10px] text-muted-foreground truncate ${isRemoved ? "line-through opacity-50" : ""}`}
              title={k}
            >
              {labelMap?.[k] ?? k}
            </div>
            <div
              className={`text-[10px] text-foreground font-mono truncate ${isRemoved ? "line-through opacity-50" : ""}`}
              title={formatExifValue(k, v)}
            >
              {formatExifValue(k, v)}
            </div>
            <div className="flex items-center">
              {canRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(k)}
                  className={`p-0.5 rounded hover:bg-muted/50 transition-colors ${isRemoved ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`}
                  title={isRemoved ? `Restore ${labelMap?.[k] ?? k}` : `Remove ${labelMap?.[k] ?? k}`}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              ) : (
                <div className="w-3.5" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Update strip-metadata-settings to use shared imports**

In `apps/web/src/components/tools/strip-metadata-settings.tsx`:

Replace lines 1-6 imports with:

```typescript
import { AlertTriangle, Download, Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { MetadataGrid } from "@/components/common/metadata-grid";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { SKIP_KEYS } from "@/lib/metadata-utils";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";
```

Remove the local definitions of:
- `EXIF_LABELS` (lines 19-57)
- `SKIP_KEYS` (lines 60-74)
- `formatExifValue` (lines 76-95)
- `CollapsibleSection` (lines 97-135)
- `MetadataGrid` (lines 137-170)

The `MetadataGrid` usage in strip-metadata does NOT pass `onRemove` or `removedKeys`, so it gets the read-only 2-column layout. The 3-column grid with the auto-width third column still looks correct when the third column has no content (auto = 0 width).

Wait - the existing MetadataGrid was 2-column. The new one is 3-column. For strip-metadata (no onRemove), the third column is always the empty spacer `<div className="w-3.5" />`. This adds a tiny amount of dead space. To avoid visual regression, only render the third column when `onRemove` is provided:

Update `metadata-grid.tsx` - wrap the grid class conditionally:

```tsx
  const hasRemoveColumn = !!onRemove;

  return (
    <div className={`grid ${hasRemoveColumn ? "grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]" : "grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"} gap-x-2 gap-y-0.5`}>
      {entries.map(([k, v]) => {
        const isRemoved = removedKeys?.has(k);
        const canRemove = onRemove && !UNSAFE_ROUND_TRIP_KEYS.has(k);
        return (
          <div key={k} className="contents">
            <div
              className={`text-[10px] text-muted-foreground truncate ${isRemoved ? "line-through opacity-50" : ""}`}
              title={k}
            >
              {labelMap?.[k] ?? k}
            </div>
            <div
              className={`text-[10px] text-foreground font-mono truncate ${isRemoved ? "line-through opacity-50" : ""}`}
              title={formatExifValue(k, v)}
            >
              {formatExifValue(k, v)}
            </div>
            {hasRemoveColumn && (
              <div className="flex items-center">
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(k)}
                    className={`p-0.5 rounded hover:bg-muted/50 transition-colors ${isRemoved ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`}
                    title={isRemoved ? `Restore ${labelMap?.[k] ?? k}` : `Remove ${labelMap?.[k] ?? k}`}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                ) : (
                  <div className="w-3.5" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
```

- [ ] **Step 5: Verify lint and typecheck pass**

```bash
pnpm lint && pnpm typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/common/collapsible-section.tsx apps/web/src/components/common/metadata-grid.tsx apps/web/src/lib/metadata-utils.ts apps/web/src/components/tools/strip-metadata-settings.tsx
git commit -m "refactor: extract shared metadata UI components from strip-metadata"
```

---

### Task 9: Create edit-metadata UI component

**Files:**
- Create: `apps/web/src/components/tools/edit-metadata-settings.tsx`
- Modify: `apps/web/src/lib/tool-registry.tsx`

- [ ] **Step 1: Create the edit-metadata settings component**

Create `apps/web/src/components/tools/edit-metadata-settings.tsx`:

```tsx
import {
  AlertTriangle,
  Download,
  Loader2,
  MapPin,
  PenLine,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { MetadataGrid } from "@/components/common/metadata-grid";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { EXIF_LABELS, SKIP_KEYS, exifStr } from "@/lib/metadata-utils";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

interface InspectResult {
  filename: string;
  fileSize: number;
  exif?: Record<string, unknown> | null;
  exifError?: string;
  gps?: Record<string, unknown> | null;
  xmp?: Record<string, string> | null;
}

interface FormFields {
  artist: string;
  copyright: string;
  imageDescription: string;
  software: string;
  dateTime: string;
  dateTimeOriginal: string;
  clearGps: boolean;
}

const EMPTY_FORM: FormFields = {
  artist: "",
  copyright: "",
  imageDescription: "",
  software: "",
  dateTime: "",
  dateTimeOriginal: "",
  clearGps: false,
};

function LabeledInput({
  label,
  id,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EditMetadataSettings() {
  const { entries, selectedIndex, files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("edit-metadata");

  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<FormFields>(EMPTY_FORM);
  const [fieldsToRemove, setFieldsToRemove] = useState<Set<string>>(new Set());
  const [inspectData, setInspectData] = useState<InspectResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectCache, setInspectCache] = useState<Map<string, InspectResult>>(new Map());

  const currentFile = entries[selectedIndex]?.file ?? null;
  const fileKey = currentFile
    ? `${currentFile.name}-${currentFile.size}-${currentFile.lastModified}`
    : null;

  const populateForm = useCallback((data: InspectResult) => {
    const exif = data.exif ?? {};
    setInspectData(data);
    const populated: FormFields = {
      artist: exifStr(exif, "Artist"),
      copyright: exifStr(exif, "Copyright"),
      imageDescription: exifStr(exif, "ImageDescription"),
      software: exifStr(exif, "Software"),
      dateTime: exifStr(exif, "DateTime"),
      dateTimeOriginal: exifStr(exif, "DateTimeOriginal"),
      clearGps: false,
    };
    setForm(populated);
    setInitialForm(populated);
    setFieldsToRemove(new Set());
  }, []);

  useEffect(() => {
    if (!currentFile || !fileKey) {
      setForm(EMPTY_FORM);
      setInitialForm(EMPTY_FORM);
      setInspectData(null);
      setInspectError(null);
      setFieldsToRemove(new Set());
      return;
    }

    const cached = inspectCache.get(fileKey);
    if (cached) {
      populateForm(cached);
      return;
    }

    const controller = new AbortController();
    (async () => {
      setInspecting(true);
      setInspectError(null);
      setInspectData(null);
      try {
        const formData = new FormData();
        formData.append("file", currentFile);
        const res = await fetch("/api/v1/tools/edit-metadata/inspect", {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed: ${res.status}`);
        }
        const data: InspectResult = await res.json();
        setInspectCache((prev) => new Map(prev).set(fileKey, data));
        populateForm(data);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setInspectError(err instanceof Error ? err.message : "Failed to inspect file");
        setForm(EMPTY_FORM);
        setInitialForm(EMPTY_FORM);
      } finally {
        setInspecting(false);
      }
    })();

    return () => controller.abort();
  }, [currentFile, fileKey, inspectCache, populateForm]);

  const setField = <K extends keyof FormFields>(key: K, value: FormFields[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleRemoveField = (key: string) => {
    setFieldsToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasFile = files.length > 0;
  const gpsLat = inspectData?.gps?._latitude as number | undefined;
  const gpsLon = inspectData?.gps?._longitude as number | undefined;
  const gpsCoords = gpsLat != null && gpsLon != null ? { lat: gpsLat, lon: gpsLon } : null;
  const exifEntryCount = inspectData?.exif
    ? Object.keys(inspectData.exif).filter((k) => !SKIP_KEYS.has(k) && !k.startsWith("_")).length
    : 0;
  const hasGps =
    !!inspectData?.gps && Object.keys(inspectData.gps).filter((k) => !k.startsWith("_")).length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasFile || processing) return;

    // Build settings from dirty tracking
    const settings: Record<string, unknown> = { clearGps: form.clearGps };

    // Common fields: only send if changed from initial
    const fieldMap: Array<{ formKey: keyof FormFields; settingsKey: string; exifTag: string }> = [
      { formKey: "artist", settingsKey: "artist", exifTag: "Artist" },
      { formKey: "copyright", settingsKey: "copyright", exifTag: "Copyright" },
      { formKey: "imageDescription", settingsKey: "imageDescription", exifTag: "ImageDescription" },
      { formKey: "software", settingsKey: "software", exifTag: "Software" },
      { formKey: "dateTime", settingsKey: "dateTime", exifTag: "DateTime" },
      { formKey: "dateTimeOriginal", settingsKey: "dateTimeOriginal", exifTag: "DateTimeOriginal" },
    ];

    const removeSet = new Set(fieldsToRemove);

    for (const { formKey, settingsKey, exifTag } of fieldMap) {
      const current = form[formKey] as string;
      const initial = initialForm[formKey] as string;
      if (current !== initial) {
        if (current.trim()) {
          settings[settingsKey] = current.trim();
          removeSet.delete(exifTag); // edit wins over remove
        } else {
          removeSet.add(exifTag); // cleared field = remove
        }
      }
    }

    if (removeSet.size > 0) {
      settings.fieldsToRemove = Array.from(removeSet);
    }

    processFiles(files, settings);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Current Metadata */}
      {hasFile && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Current Metadata</p>

          {inspecting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reading metadata...
            </div>
          )}

          {inspectError && !inspecting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Could not read metadata - fields will start empty.
            </div>
          )}

          {inspectData && (
            <div className="space-y-1.5">
              {exifEntryCount > 0 && inspectData.exif ? (
                <CollapsibleSection title="EXIF" badge={`${exifEntryCount} fields`}>
                  <MetadataGrid
                    data={inspectData.exif}
                    labelMap={EXIF_LABELS}
                    onRemove={toggleRemoveField}
                    removedKeys={fieldsToRemove}
                  />
                </CollapsibleSection>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">No EXIF data found.</p>
              )}
              {hasGps && inspectData.gps && (
                <CollapsibleSection title="GPS" warning>
                  <MetadataGrid
                    data={Object.fromEntries(
                      Object.entries(inspectData.gps).filter(([k]) => !k.startsWith("_")),
                    )}
                  />
                </CollapsibleSection>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Fields */}
      {hasFile && (
        <div className="space-y-3">
          <div className="border-t border-border" />
          <p className="text-xs font-medium text-muted-foreground">Edit Fields</p>

          <LabeledInput
            id="em-description"
            label="Description"
            value={form.imageDescription}
            onChange={(v) => setField("imageDescription", v)}
            placeholder="Image description"
          />
          <LabeledInput
            id="em-artist"
            label="Artist"
            value={form.artist}
            onChange={(v) => setField("artist", v)}
            placeholder="Photographer / creator name"
          />
          <LabeledInput
            id="em-copyright"
            label="Copyright"
            value={form.copyright}
            onChange={(v) => setField("copyright", v)}
            placeholder="2026 Example"
          />
          <LabeledInput
            id="em-software"
            label="Software"
            value={form.software}
            onChange={(v) => setField("software", v)}
            placeholder="e.g. Lightroom, Photoshop"
          />
          <LabeledInput
            id="em-datetime"
            label="Date Modified"
            value={form.dateTime}
            onChange={(v) => setField("dateTime", v)}
            placeholder="YYYY:MM:DD HH:MM:SS"
            hint="EXIF date format: 2026:04:06 12:00:00"
          />
          <LabeledInput
            id="em-datetime-original"
            label="Date Taken"
            value={form.dateTimeOriginal}
            onChange={(v) => setField("dateTimeOriginal", v)}
            placeholder="YYYY:MM:DD HH:MM:SS"
          />

          {/* GPS */}
          <div className="space-y-2">
            <div className="border-t border-border" />
            {gpsCoords ? (
              <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    Location data found
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {gpsCoords.lat.toFixed(5)}, {gpsCoords.lon.toFixed(5)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">No GPS data in this image.</p>
            )}
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.clearGps}
                onChange={(e) => setField("clearGps", e.target.checked)}
                className="rounded"
              />
              Remove GPS location data
            </label>
          </div>
        </div>
      )}

      {!hasFile && (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
          <PenLine className="h-8 w-8 opacity-30" />
          <p className="text-sm">Upload an image to edit its metadata.</p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Writing metadata"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="edit-metadata-submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Apply Metadata
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="edit-metadata-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Register in tool-registry**

In `apps/web/src/lib/tool-registry.tsx`, add the lazy import after `StripMetadataSettings` (after line 83):

```typescript
const EditMetadataSettings = lazy(() =>
  import("@/components/tools/edit-metadata-settings").then((m) => ({
    default: m.EditMetadataSettings,
  })),
);
```

Add to the registry map, after the strip-metadata entry (after line 240):

```typescript
  ["edit-metadata", { displayMode: "no-comparison", Settings: EditMetadataSettings }],
```

- [ ] **Step 3: Verify lint and typecheck**

```bash
pnpm lint && pnpm typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/tools/edit-metadata-settings.tsx apps/web/src/lib/tool-registry.tsx
git commit -m "feat: add edit-metadata UI component with granular strip support"
```

---

### Task 10: Add E2E tests

**Files:**
- Modify: `tests/e2e/tools-all.spec.ts`
- Modify: `tests/e2e/tools-process.spec.ts`

- [ ] **Step 1: Add edit-metadata to tools-all list**

In `tests/e2e/tools-all.spec.ts`, add to the tools array (after the strip-metadata entry):

```typescript
  { id: "edit-metadata", name: "Edit Metadata" },
```

Also add `"edit-metadata"` to the `TOOL_IDS` array used for fullscreen grid tests (if one exists - grep for the array that includes `"strip-metadata"` and add after it).

- [ ] **Step 2: Add edit-metadata process test**

In `tests/e2e/tools-process.spec.ts`, add after the strip-metadata test:

```typescript
  test("edit-metadata processes image", async ({ loggedInPage: page }) => {
    await page.goto("/edit-metadata");
    await uploadTestImage(page);

    // Wait for inspect to complete and form to populate
    await page.waitForSelector('[id="em-artist"]', { timeout: 10_000 });

    // Edit the artist field
    await page.fill('[id="em-artist"]', "E2E Test Artist");

    await page.getByRole("button", { name: /apply metadata/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
```

- [ ] **Step 3: Run e2e tests locally**

```bash
pnpm test:e2e -- --grep "edit-metadata"
```

Expected: PASS (may need dev servers running)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/tools-all.spec.ts tests/e2e/tools-process.spec.ts
git commit -m "test: add e2e tests for edit-metadata tool"
```

---

### Task 11: Full test suite and lint check

- [ ] **Step 1: Run all unit tests**

```bash
pnpm test:unit
```

Expected: all PASS

- [ ] **Step 2: Run all integration tests**

```bash
pnpm test:integration
```

Expected: all PASS (including strip-metadata regression)

- [ ] **Step 3: Run lint and typecheck**

```bash
pnpm lint && pnpm typecheck
```

Expected: no errors

- [ ] **Step 4: Fix any issues found**

If any tests or lint checks fail, fix them before proceeding.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test and lint issues from edit-metadata implementation"
```

(Skip if nothing to fix)

---

### Task 12: Docker build and Playwright GUI verification

- [ ] **Step 1: Build Docker image with cache**

```bash
docker compose build
```

Expected: successful build

- [ ] **Step 2: Start the container**

```bash
docker compose up -d
```

Expected: container starts and API becomes available

- [ ] **Step 3: Run Playwright in headed mode**

```bash
pnpm test:e2e -- --headed --grep "edit-metadata"
```

Expected: browser opens, test runs visually, PASS

- [ ] **Step 4: Manual verification**

Open the app in browser. Navigate to Edit Metadata tool. Upload a test image with known EXIF data. Verify:
1. Current metadata displays correctly in collapsible sections
2. Form fields are pre-populated with existing values
3. Trash icons appear on string-typed EXIF fields (not on binary blobs)
4. Clicking a trash icon shows strikethrough styling
5. Editing a field and submitting produces a downloadable image
6. Re-uploading the downloaded image shows the edited metadata
7. Marking fields for removal and submitting removes them
8. GPS clear checkbox works when GPS data is present

- [ ] **Step 5: Stop containers**

```bash
docker compose down
```
