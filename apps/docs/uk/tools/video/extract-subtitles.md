---
description: "Витягує доріжку субтитрів із відео як файл SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 1a56be3f8b20
---

# Extract Subtitles {#extract-subtitles}

Витягує вбудовану доріжку субтитрів із відеоконтейнера й завантажує її як файл SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Приймає дані форми multipart із відеофайлом. Цей інструмент не має налаштувань.

## Parameters {#parameters}

Цей інструмент не має параметрів. Він витягує першу знайдену доріжку субтитрів у відеоконтейнері.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Відео має містити вбудовану доріжку субтитрів. Якщо доріжку субтитрів не знайдено, запит повертає помилку 400.
- Якщо відео має кілька доріжок субтитрів, витягується перша.
- Вихідний формат - SRT, незалежно від оригінального формату субтитрів у контейнері.
