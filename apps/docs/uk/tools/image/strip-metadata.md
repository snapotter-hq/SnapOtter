---
description: "Видалення метаданих EXIF, GPS, ICC та XMP із зображень для конфіденційності та зменшення розміру файлів."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: 93185dd2ce7b
---

# Видалення метаданих зображення {#remove-metadata}

Видаліть метадані EXIF, GPS, кольорові профілі ICC та метадані XMP із зображень. Корисно для конфіденційності (видалення GPS-координат, інформації про камеру) та зменшення розміру файлу.

## Кінцеві точки API {#api-endpoints}

### Видалити метадані {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Обробляє зображення та повертає очищену версію з видаленими обраними метаданими.

### Оглянути метадані {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Повертає розібрані метадані у форматі JSON без зміни зображення. Корисно для попереднього перегляду наявних метаданих перед видаленням.

## Параметри (Видалення) {#parameters-strip}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | Ні | `false` | Видалити дані EXIF (налаштування камери, дати тощо) |
| stripGps | boolean | Ні | `false` | Видалити лише дані GPS/розташування |
| stripIcc | boolean | Ні | `false` | Видалити кольоровий профіль ICC |
| stripXmp | boolean | Ні | `false` | Видалити метадані XMP (Adobe, IPTC) |
| stripAll | boolean | Ні | `true` | Видалити всі метадані одразу |

Коли `stripAll` дорівнює `true`, це перевизначає окремі прапорці та видаляє все.

## Приклад запиту {#example-request}

Видалити всі метадані:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Видалити лише дані GPS (зберегти інформацію про камеру та кольоровий профіль):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Оглянути метадані без зміни:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Приклад відповіді (Видалення) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Приклад відповіді (Огляд) {#example-response-inspect}

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

## Примітки {#notes}

- Зображення повторно кодується у своєму оригінальному форматі після видалення. JPEG використовує mozjpeg з якістю 90, PNG використовує рівень стиснення 9, WebP використовує якість 85.
- Видалення профілів ICC може спричинити ледь помітні зсуви кольору, якщо зображення було позначене профілем, відмінним від sRGB. Використовуйте `stripIcc: false`, якщо точність кольору має значення.
- Кінцева точка огляду розбирає GPS-координати на десяткові значення широти/довготи (із префіксом підкреслення) для зручності.
- Підтримувані вхідні формати: JPEG, PNG, WebP, AVIF, TIFF, GIF.
