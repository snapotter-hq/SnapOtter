---
description: "Конвертуйте зображення між форматами, включно із сучасними форматами, як-от AVIF, JXL та HEIC."
i18n_source_hash: 562f8270e8c3
i18n_provenance: human
i18n_output_hash: cc673ec4e84d
---

# Convert {#convert}

Конвертуйте зображення між форматами. Підтримує поширені веб-формати, а також спеціалізовані формати, як-от HEIC, JXL, BMP, ICO, JP2, QOI та PSD.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/convert`

Приймає дані форми multipart із файлом зображення та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Цільовий формат: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | No | - | Якість вихідного файлу (1-100). Застосовується до форматів зі втратами, як-от jpg, webp, avif, heic. |

## Supported Output Formats {#supported-output-formats}

| Format | Type | Notes |
|--------|------|-------|
| jpg | Lossy | JPEG, найкраща сумісність |
| png | Lossless | Підтримує прозорість |
| webp | Both | Сучасний веб-формат, хороше стиснення |
| avif | Lossy | Формат нового покоління, чудове стиснення |
| tiff | Both | Робочі процеси друку/видавництва |
| gif | Lossless | Обмежено 256 кольорами |
| heic / heif | Lossy | Формат екосистеми Apple |
| jxl | Both | JPEG XL, формат нового покоління |
| bmp | Lossless | Нестиснена растрова карта |
| ico | Lossless | Формат значків Windows |
| jp2 | Lossy | JPEG 2000 |
| qoi | Lossless | Формат Quite OK Image |
| psd | Layered | Adobe Photoshop (потребує ImageMagick) |
| ppm | Lossless | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vector | Encapsulated PostScript |
| tga | Lossless | Формат зображень Targa |

## Example Request {#example-request}

Конвертувати у WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Конвертувати у PNG (без втрат):

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

- Розширення вихідного файлу автоматично оновлюється відповідно до цільового формату.
- Вхідні дані SVG растеризуються з роздільною здатністю 300 DPI перед конвертацією.
- Конвертація PSD потребує встановлення ImageMagick на сервері.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI та TGA використовують спеціалізовані CLI-кодувальники та обходять обробку Sharp.
- Кодування HEIC/HEIF використовує системну бібліотеку кодувальника HEIC.
- Вхідні формати широкі: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW тощо), PSD, SVG, BMP та інші.
