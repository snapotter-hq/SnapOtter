---
description: Generate all standard favicon and app icon sizes from a source image.
---

# Favicon Generator

Generate a complete set of favicon and app icon files from a source image. Produces all standard sizes needed for browsers, Apple devices, and Android, along with a web manifest and an HTML snippet.

## API Endpoint

`POST /api/v1/tools/image/favicon`

Accepts multipart form data with one or more image files and an optional JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| background | string | No | - | Background hex color (e.g. `"#ffffff"`). When set, the icon is flattened onto this color. |
| padding | integer | No | `0` | Padding percentage around the icon content (0 to 40) |
| radius | integer | No | `0` | Corner radius percentage for rounded icons (0 to 50) |
| sizes | integer[] | No | - | Restrict output to specific pixel sizes (e.g. `[16, 32, 180]`). Omit to generate all standard sizes. |
| themeColor | string | No | `"#ffffff"` | Theme color hex for the web manifest |

## Generated Files

For each input image, the following files are produced:

| File | Size | Purpose |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Browser tab icon |
| `favicon-32x32.png` | 32x32 | Browser tab icon (HiDPI) |
| `favicon-48x48.png` | 48x48 | Desktop shortcut |
| `apple-touch-icon.png` | 180x180 | iOS home screen |
| `android-chrome-192x192.png` | 192x192 | Android home screen |
| `android-chrome-512x512.png` | 512x512 | Android splash screen |
| `favicon.ico` | 32x32 | Legacy ICO format |
| `manifest.json` | - | Web app manifest with icon references |
| `favicon-snippet.html` | - | Ready-to-use HTML link tags |

## Example Request

Single source image with rounded corners and padding:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Multiple source images (each gets its own set in a subfolder):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Example Response

The response is a ZIP file streamed directly. The response headers are:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## HTML Snippet Included

The ZIP includes a `favicon-snippet.html` file you can paste into your HTML `<head>`:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Notes

- Source images are resized using `cover` fit mode, meaning they are cropped to fill each square size. For best results, use a square source image.
- When multiple files are uploaded, each gets its own subfolder in the ZIP (named after the source file).
- For a single file upload, all outputs are at the root of the ZIP with no subfolder.
- Files that fail validation or decoding are skipped, and a `skipped-files.txt` is included in the ZIP explaining the issues.
- Supported input formats: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD, and more.
- EXIF orientation is auto-applied before resizing.
