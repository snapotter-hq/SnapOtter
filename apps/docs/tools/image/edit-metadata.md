---
description: Edit EXIF, IPTC, GPS, and XMP metadata fields in images without re-encoding pixels.
---

# Edit Metadata

Edit image metadata fields including EXIF, IPTC, GPS coordinates, dates, and keywords. Uses ExifTool under the hood, so metadata is written in-place without re-encoding pixels, preserving full image quality.

## API Endpoints

### Edit Metadata

`POST /api/v1/tools/image/edit-metadata`

Writes metadata fields to the image and returns the modified file.

### Inspect Metadata

`POST /api/v1/tools/image/edit-metadata/inspect`

Returns the full metadata from the image via ExifTool as JSON. Does not modify the image.

## Parameters (Edit)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Image title (XMP/EXIF) |
| author | string | No | - | Author name |
| artist | string | No | - | Artist name (EXIF Artist tag) |
| copyright | string | No | - | Copyright notice |
| imageDescription | string | No | - | Image description (EXIF) |
| software | string | No | - | Software tag |
| dateTime | string | No | - | EXIF DateTime value |
| dateTimeOriginal | string | No | - | EXIF DateTimeOriginal value |
| setAllDates | string | No | - | Set all date fields at once |
| dateShift | string | No | - | Shift all dates by offset (format: `+HH:MM` or `-HH:MM`) |
| clearGps | boolean | No | `false` | Remove all GPS data |
| gpsLatitude | number | No | - | Set GPS latitude (-90 to 90) |
| gpsLongitude | number | No | - | Set GPS longitude (-180 to 180) |
| gpsAltitude | number | No | - | Set GPS altitude in meters |
| keywords | string[] | No | - | Keywords/tags to add or set |
| keywordsMode | string | No | `"add"` | How to handle keywords: `add` (append) or `set` (replace) |
| fieldsToRemove | string[] | No | `[]` | List of specific metadata field names to remove |
| iptcTitle | string | No | - | IPTC Object Name |
| iptcHeadline | string | No | - | IPTC Headline |
| iptcCity | string | No | - | IPTC City |
| iptcState | string | No | - | IPTC Province/State |
| iptcCountry | string | No | - | IPTC Country |

## Example Request

Set author and copyright:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Set GPS coordinates:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Remove GPS and add keywords:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Inspect metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Edit)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Notes

- This tool requires ExifTool to be installed on the server. It is included in the Docker image.
- Metadata is written in-place, so no pixel re-encoding occurs. The file size change is minimal (just the metadata bytes).
- The `dateShift` parameter shifts all date fields by the specified offset, useful for correcting timezone errors (e.g. `+02:00` or `-05:30`).
- If no changes are requested (all parameters omitted or empty), the original file is returned unchanged.
- Supported formats: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- For non-browser-previewable formats (HEIF, TIFF), the response includes a `previewUrl` field with a WebP preview.
