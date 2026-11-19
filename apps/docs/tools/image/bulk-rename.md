---
description: Rename multiple images using a pattern template and download as ZIP.
---

# Bulk Rename {#bulk-rename}

Rename multiple images using a pattern template with placeholders for index, padded index, and original filename. Returns a ZIP archive containing all renamed images.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Accepts multipart form data with multiple image files and a JSON `settings` field.

Every upload must be an image. Each file's header is checked before the ZIP starts, and the bytes are then zipped unchanged (no re-encode). If any file is not a recognized image, or exceeds `MAX_MEGAPIXELS`, the whole request fails with `400` and an error naming that file, for example `Invalid file "notes.txt": Unrecognized image format`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pattern | string | No | `"image-{{index}}"` | Naming pattern with placeholders (max 1000 characters) |
| startIndex | number | No | `1` | Starting index number |

### Pattern Placeholders {#pattern-placeholders}

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{index}}` | Sequential number starting from `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Zero-padded sequential number | `01`, `02`, `03` |
| `{{original}}` | Original filename without extension | `photo`, `IMG_001` |

The original file extension is always preserved.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

This produces: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Using original filename:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

This produces: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Example Response {#example-response}

The response is a ZIP file streamed directly (not a JSON response). The response headers are:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Notes {#notes}

- This tool does not process images. It only renames files and packages them into a ZIP archive.
- The zero-padding width for `{{padded}}` is determined automatically based on the total number of files (e.g. 100 files would use 3-digit padding: `001`, `002`, etc.).
- File extensions are preserved from the original filenames.
- Filenames are sanitized to remove unsafe characters.
- At least one file must be provided.
