---
description: Convert images between formats including modern formats like AVIF, JXL, and HEIC.
---

# Convert {#convert}

Convert images between formats. Supports common web formats as well as specialized formats like HEIC, JXL, BMP, ICO, JP2, QOI, and PSD.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/convert`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Target format: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | No | - | Output quality (1-100). Applies to lossy formats like jpg, webp, avif, heic. |

## Supported Output Formats {#supported-output-formats}

| Format | Type | Notes |
|--------|------|-------|
| jpg | Lossy | JPEG, best compatibility |
| png | Lossless | Supports transparency |
| webp | Both | Modern web format, good compression |
| avif | Lossy | Next-gen format, excellent compression |
| tiff | Both | Print/publishing workflows |
| gif | Lossless | Limited to 256 colors |
| heic / heif | Lossy | Apple ecosystem format |
| jxl | Both | JPEG XL, next-gen format |
| bmp | Lossless | Uncompressed bitmap |
| ico | Lossless | Windows icon format |
| jp2 | Lossy | JPEG 2000 |
| qoi | Lossless | Quite OK Image format |
| psd | Layered | Adobe Photoshop (requires ImageMagick) |
| ppm | Lossless | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vector | Encapsulated PostScript |
| tga | Lossless | Targa image format |

## Example Request {#example-request}

Convert to WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Convert to PNG (lossless):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Notes {#notes}

- The output filename extension is automatically updated to match the target format.
- SVG inputs are rasterized at 300 DPI before conversion.
- PSD conversion requires ImageMagick to be installed on the server.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI, and TGA use specialized CLI encoders and bypass Sharp processing.
- HEIC/HEIF encoding uses the system HEIC encoder library.
- Input formats are broad: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, etc.), PSD, SVG, BMP, and more.
