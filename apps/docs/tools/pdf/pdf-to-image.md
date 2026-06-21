---
description: Convert PDF pages to high-quality images.
---

# PDF to Image

Convert PDF pages to high-quality raster images. Supports page selection, multiple output formats, DPI control, and color modes. Includes info and preview sub-routes for inspecting PDFs before conversion.

## API Endpoint

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | Output format: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | No | 150 | Render resolution (36 to 2400). Higher DPI produces larger, more detailed images. |
| quality | number | No | 85 | Output quality for lossy formats (1 to 100) |
| colorMode | string | No | `"color"` | Color mode: `color`, `grayscale`, `bw` (black and white threshold) |
| pages | string | No | `"all"` | Page selection: `all`, single page (`3`), range (`1-5`), or comma-separated (`1,3,5-8`) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route

`POST /api/v1/tools/pdf/pdf-to-image/info`

Returns the page count of a PDF without rendering any pages.

### Info Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Returns low-resolution JPEG thumbnails of all pages as base64 data URLs. Useful for building a page selection UI.

### Preview Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes

- Uses MuPDF for PDF rendering, providing high-fidelity output with correct font rendering and vector graphics.
- Password-protected PDFs are not supported and will return a 400 error.
- The `pages` parameter supports flexible syntax:
  - `"all"` or `""` - all pages
  - `"3"` - single page
  - `"1-5"` - page range (inclusive)
  - `"1,3,5-8"` - mixed individual pages and ranges
- Page numbers are 1-based. Specifying pages beyond the document length returns a 400 error.
- The main endpoint always generates both individual page downloads and a ZIP containing all selected pages.
- The preview endpoint renders at 72 DPI and scales to 300px width for fast thumbnail generation. Thumbnails are JPEG at 60% quality.
- The preview endpoint respects the `MAX_PDF_PAGES` server configuration, limiting how many thumbnails are generated.
- For large documents at high DPI, processing time increases proportionally. Consider using lower DPI (150) for web use and higher DPI (300-600) for print.
