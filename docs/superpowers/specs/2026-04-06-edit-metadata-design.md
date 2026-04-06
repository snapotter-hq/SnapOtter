# Edit Metadata Tool - Design Spec

**Date:** 2026-04-06
**Issue:** [stirling-image/stirling-image#15](https://github.com/stirling-image/stirling-image/issues/15)
**Approach:** Shared metadata infrastructure (Approach 2)

## Overview

A new tool for editing and selectively removing EXIF metadata from images. Covers common editable fields (description, artist, copyright, software, dates), GPS clearing, and granular per-field stripping. Builds on shared infrastructure extracted from the existing strip-metadata tool.

## Scope

**In scope:**
- Edit common EXIF fields: description, artist, copyright, software, date modified, date taken
- GPS clear via checkbox
- Granular strip: per-field removal of any displayed EXIF tag
- Read-only display of current metadata (EXIF, GPS, XMP)
- Pre-population of edit form from current values
- Dirty tracking to distinguish untouched/edited/cleared fields
- Shared metadata parsing and UI components extracted from strip-metadata

**Out of scope (potential future work):**
- Arbitrary advanced EXIF field editing (camera make/model, lens, exposure, etc.)
- XMP/ICC profile editing
- Batch-specific metadata (different values per file)

## Architecture

### File changes

```
packages/image-engine/
  src/utils/metadata.ts           EXTEND  add parseExif(), parseGps(), parseXmp(), sanitizeValue()
  src/operations/edit-metadata.ts NEW     editMetadata() function
  src/types.ts                    EXTEND  add EditMetadataOptions
  src/index.ts                    EXTEND  export new operation

apps/api/
  src/routes/tools/edit-metadata.ts   NEW      /inspect + /edit endpoints
  src/routes/tools/strip-metadata.ts  REFACTOR swap local parsing helpers for shared imports
  src/routes/tools/index.ts           EXTEND   register new tool

apps/web/
  src/components/common/collapsible-section.tsx  NEW      extract from strip-metadata
  src/components/common/metadata-grid.tsx        NEW      extract from strip-metadata
  src/lib/metadata-utils.ts                      NEW      EXIF_LABELS, SKIP_KEYS, formatExifValue, exifStr
  src/components/tools/edit-metadata-settings.tsx NEW      main component
  src/components/tools/strip-metadata-settings.tsx REFACTOR use shared imports
  src/lib/tool-registry.tsx                       EXTEND   register new tool

packages/shared/
  src/constants.ts  EXTEND  add tool entry
  src/i18n/en.ts    EXTEND  add i18n strings
```

### Image-engine layer

**Extended `utils/metadata.ts`** adds four parsing functions alongside the existing `getImageInfo()`:

- `sanitizeValue(v)` - makes EXIF values JSON-safe (Dates to ISO strings, Buffers to arrays or `<binary N bytes>`, recursion for nested objects)
- `parseExif(exifBuffer)` - calls `exif-reader`, returns `{ image, photo, iop }` sections with sanitized values
- `parseGps(gpsInfo)` - extracts DMS coordinates to decimal `{ latitude, longitude, altitude }`
- `parseXmp(xmpBuffer)` - regex extraction of key/value pairs from XMP XML

**New `operations/edit-metadata.ts`** - `editMetadata(image, options)`:

- Maps common option fields (artist, copyright, imageDescription, software, dateTime, dateTimeOriginal) to their IFD0/IFD2 EXIF tag names
- Accepts `fieldsToRemove: string[]` for granular strip
- Logic:
  - If `clearGps` or `fieldsToRemove` has entries: read existing EXIF, rebuild the EXIF object minus the removed fields/GPS, merge in edits, then `withExif()` (full replace)
  - If only edits (no removals): `withExifMerge()` (non-destructive merge)
  - If nothing to do: `keepMetadata()` (passthrough)

**New type:**
```ts
interface EditMetadataOptions {
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

### API route design

**`POST /api/v1/tools/edit-metadata/inspect`** - custom endpoint:
- Accepts multipart file upload
- Calls shared parsing functions from image-engine
- Returns:
  ```json
  {
    "filename": "photo.jpg",
    "fileSize": 2048000,
    "exif": { "Artist": "John", "Software": "Lightroom", ... },
    "gps": { "GPSLatitude": [...], "_latitude": 51.5074, "_longitude": -0.1278, ... },
    "xmp": { "dc:creator": "John", ... }
  }
  ```

**`POST /api/v1/tools/edit-metadata`** - via `createToolRoute` factory:
- Settings schema:
  ```ts
  z.object({
    artist: z.string().optional(),
    copyright: z.string().optional(),
    imageDescription: z.string().optional(),
    software: z.string().optional(),
    dateTime: z.string().optional(),
    dateTimeOriginal: z.string().optional(),
    clearGps: z.boolean().default(false),
    fieldsToRemove: z.array(z.string()).default([]),
  })
  ```
- Process function: reads format, calls `editMetadata(image, settings)`, re-encodes in original format, returns `{ buffer, filename, contentType }`

### UI component design

**Shared extractions (from strip-metadata):**
- `CollapsibleSection` to `components/common/collapsible-section.tsx` - unchanged from strip-metadata
- `MetadataGrid` to `components/common/metadata-grid.tsx` - extended with optional `onRemove?: (key: string) => void` and `removedKeys?: Set<string>` props. When `onRemove` is provided, each row shows a trash icon. When a key is in `removedKeys`, the row renders with strikethrough + muted styling. Strip-metadata passes neither prop (read-only behavior preserved).
- `EXIF_LABELS`, `SKIP_KEYS`, `formatExifValue()`, `exifStr()` to `lib/metadata-utils.ts`

**`EditMetadataSettings` - three sections:**

**1. Current Metadata (read-only + granular strip)**
- Auto-fetched via `/inspect` on file selection (per-file cache, AbortController cleanup)
- EXIF: `CollapsibleSection` with `MetadataGrid`. String-typed and safely-serializable fields get a trash icon for granular removal. Binary blobs (MakerNote, PrintImageMatching) and complex array fields are displayed read-only without a remove option - this avoids data corruption from lossy EXIF round-trips through `withExif()`. Clicking a trash icon toggles the tag into `fieldsToRemove` set (strikethrough + muted styling).
- GPS: `CollapsibleSection` with warning styling if GPS detected, coordinates displayed

**2. Edit Fields**
- Common fields: Description, Artist, Copyright, Software, Date Modified, Date Taken as `LabeledInput` components, pre-populated from inspect data
- Dirty tracking: store initial values from inspect. On submit, compare current to initial. Changed + has value = include in settings. Changed + empty = add to `fieldsToRemove`. Untouched = skip.
- GPS: "Remove GPS location data" checkbox with coordinate display if present

**3. Submit / Download**
- Submit via `useToolProcessor("edit-metadata")`
- `ProgressCard` during processing, download link after

**Display mode:** `"no-comparison"` in tool registry.

**Edit + remove conflict resolution:** If a user marks a field for removal in the metadata view AND edits the same field in the edit form, the edit wins. Submit logic checks edit fields first, only adds to `fieldsToRemove` tags that aren't being written.

## Data Flow

1. User drops image into dropzone
2. Component auto-calls `/inspect`, parses response, pre-populates form, stores initial values
3. User edits fields and/or marks tags for removal in metadata view
4. On submit: dirty-diff builds settings object (e.g. `{ artist: "New Name", fieldsToRemove: ["Software", "MeteringMode"], clearGps: true }`)
5. Tool factory receives file + settings, calls `editMetadata()`, re-encodes, returns download URL
6. User downloads modified image

## Error Handling

- **Inspect fails** (corrupt file, unsupported format): inline warning "Could not read metadata", form fields start empty, user can still write new metadata
- **No EXIF in image**: "No metadata found" in current metadata section, form fields start empty, editing still works (writes fresh EXIF)
- **Format with limited EXIF support** (PNG): no special handling. Sharp writes what the format supports, silently drops what it doesn't. Matches strip-metadata behavior.
- **Processing fails**: tool factory returns 422, component displays error from response
- **No changes submitted**: `keepMetadata()` passthrough, image re-encoded with metadata preserved

## Testing

### Unit tests (image-engine)
- `editMetadata` writes common fields, readable back via `exif-reader`
- `editMetadata` with `clearGps: true` removes GPS, preserves other EXIF
- `editMetadata` with `fieldsToRemove` drops specific tags, preserves others
- `editMetadata` with no options preserves metadata
- Edit + remove conflict: edit wins
- Works through `processImage` pipeline

### Unit tests (web utilities)
- Dirty tracking: detects changed fields, cleared fields, ignores untouched
- Settings builder: correctly splits edits vs removals
- `formatExifValue` and `exifStr` tests (moved from fork's tests to shared location)

### Integration tests (API)
- `/inspect` returns parsed EXIF/GPS/XMP for test JPEG with known metadata
- `/inspect` returns nulls for metadata-free PNG
- `/inspect` rejects no-file and invalid-file requests
- Edit endpoint writes metadata, returns downloadable file
- Edit endpoint with `fieldsToRemove` strips specific tags
- Edit endpoint with `clearGps` removes GPS
- Edit endpoint with empty settings preserves original metadata

### Strip-metadata regression
- Re-run all existing strip-metadata tests after the shared extraction refactor to confirm no behavioral changes

### E2e tests (Playwright)
- Tool appears in tool list and is navigable
- Upload image, verify metadata displays
- Edit a field, submit, download, re-upload and verify
- Mark a field for removal, submit, verify removal
- Add to `tools-all.spec.ts`

### Docker + Playwright GUI verification
- Docker rebuild with cache
- Spin up container
- Playwright headed/GUI mode against running container
- Manual verification: navigate to tool, upload test image with known EXIF/GPS, confirm metadata displays, edit fields, mark tags for removal, submit, download, re-upload to confirm changes persisted
