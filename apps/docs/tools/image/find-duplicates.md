---
description: Detect duplicate and near-duplicate images using perceptual hashing.
---

# Find Duplicates

Upload multiple images to detect duplicates and near-duplicates using perceptual hashing (dHash). Groups similar images together, identifies the best quality version in each group, and calculates potential space savings.

## API Endpoint

`POST /api/v1/tools/image/find-duplicates`

Accepts multipart form data with multiple image files and an optional JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| threshold | number | No | `8` | Maximum Hamming distance to consider images as duplicates (0 to 20). Lower = stricter matching |

### File Fields

Upload at least 2 image files in the multipart request (all using the `file` field name or any field name for file parts).

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Example Response

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| totalImages | number | Number of images successfully analyzed |
| duplicateGroups | array | Groups of duplicate images |
| uniqueImages | number | Number of images not part of any duplicate group |
| spaceSaveable | number | Total bytes that could be saved by removing non-best duplicates |
| skippedFiles | array | Files that could not be processed (with filename and reason) |

### Duplicate Group Object

| Field | Type | Description |
|-------|------|-------------|
| groupId | number | Group identifier |
| files | array | Images in this duplicate group |

### File Object (within a group)

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Original filename |
| similarity | number | Similarity percentage to the reference image (first in group) |
| width | number | Image width in pixels |
| height | number | Image height in pixels |
| fileSize | number | File size in bytes |
| format | string | Image format |
| isBest | boolean | Whether this is the highest quality version (most pixels, largest file) |
| thumbnail | string or null | Base64 JPEG thumbnail (200px wide) for preview |

## Notes

- Uses a 128-bit dHash (64-bit row + 64-bit column) for perceptual similarity detection. This catches duplicates even across resizes, recompression, and minor edits.
- The threshold represents maximum Hamming distance between hashes. Default of 8 catches near-duplicates while avoiding false positives. Use 0 for pixel-identical only, or 15-20 for very loose matching.
- The "best" image in each group is the one with the most pixels (width x height), with file size as a tiebreaker.
- At least 2 images are required. Files that fail validation or decoding are reported in `skippedFiles` rather than causing the entire request to fail.
- Thumbnails are 200px-wide JPEG previews encoded as data URIs.
- All common formats are supported (HEIC, RAW, PSD, SVG decoded automatically).
