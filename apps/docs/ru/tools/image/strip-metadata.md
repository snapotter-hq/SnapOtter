---
description: "Удаление метаданных EXIF, GPS, ICC и XMP из изображений для приватности и уменьшения размера файла."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: 3bc878783056
---

# Удаление метаданных изображения {#remove-metadata}

Удалите метаданные EXIF, GPS, цветовые профили ICC и метаданные XMP из изображений. Полезно для приватности (удаление GPS-координат, информации о камере) и уменьшения размера файла.

## Конечные точки API {#api-endpoints}

### Удаление метаданных {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Обрабатывает изображение и возвращает очищенную версию с удалёнными выбранными метаданными.

### Просмотр метаданных {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Возвращает разобранные метаданные в виде JSON без изменения изображения. Полезно для предварительного просмотра существующих метаданных перед удалением.

## Параметры (удаление) {#parameters-strip}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | Нет | `false` | Удалить данные EXIF (настройки камеры, даты и т. д.) |
| stripGps | boolean | Нет | `false` | Удалить только данные GPS/местоположения |
| stripIcc | boolean | Нет | `false` | Удалить цветовой профиль ICC |
| stripXmp | boolean | Нет | `false` | Удалить метаданные XMP (Adobe, IPTC) |
| stripAll | boolean | Нет | `true` | Удалить все метаданные сразу |

Когда `stripAll` равно `true`, оно переопределяет отдельные флаги и удаляет всё.

## Пример запроса {#example-request}

Удалить все метаданные:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Удалить только данные GPS (сохранив информацию о камере и цветовой профиль):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Просмотреть метаданные без изменения:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Пример ответа (удаление) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Пример ответа (просмотр) {#example-response-inspect}

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

## Примечания {#notes}

- Изображение перекодируется в свой исходный формат после удаления. JPEG использует mozjpeg с качеством 90, PNG использует уровень сжатия 9, WebP использует качество 85.
- Удаление профилей ICC может вызвать незначительные сдвиги цвета, если изображение было помечено профилем, отличным от sRGB. Используйте `stripIcc: false`, если важна точность цвета.
- Конечная точка просмотра разбирает GPS-координаты в десятичные значения широты/долготы (с префиксом подчёркивания) для удобства.
- Поддерживаемые входные форматы: JPEG, PNG, WebP, AVIF, TIFF, GIF.
