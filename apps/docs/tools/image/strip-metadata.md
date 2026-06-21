---
description: Remove EXIF, GPS, ICC, and XMP metadata from images for privacy and smaller file sizes.
---

# Remove Metadata

Remove EXIF, GPS, ICC color profiles, and XMP metadata from images. Useful for privacy (removing GPS coordinates, camera info) and reducing file size.

## API Endpoints

### Strip Metadata

`POST /api/v1/tools/image/strip-metadata`

Processes the image and returns a cleaned version with selected metadata removed.

### Inspect Metadata

`POST /api/v1/tools/image/strip-metadata/inspect`

Returns the parsed metadata as JSON without modifying the image. Useful for previewing what metadata exists before stripping.

## Parameters (Strip)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | No | `false` | Remove EXIF data (camera settings, dates, etc.) |
| stripGps | boolean | No | `false` | Remove GPS/location data only |
| stripIcc | boolean | No | `false` | Remove ICC color profile |
| stripXmp | boolean | No | `false` | Remove XMP metadata (Adobe, IPTC) |
| stripAll | boolean | No | `true` | Remove all metadata at once |

When `stripAll` is `true`, it overrides the individual flags and removes everything.

## Example Request

Strip all metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Strip only GPS data (keep camera info and color profile):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Inspect metadata without modifying:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Strip)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Example Response (Inspect)

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Notes

- The image is re-encoded in its original format after stripping. JPEG uses mozjpeg at quality 90, PNG uses compression level 9, WebP uses quality 85.
- Stripping ICC profiles may cause subtle color shifts if the image was tagged with a non-sRGB profile. Use `stripIcc: false` if color accuracy matters.
- The inspect endpoint parses GPS coordinates into decimal latitude/longitude values (prefixed with underscore) for convenience.
- Supported input formats: JPEG, PNG, WebP, AVIF, TIFF, GIF.
