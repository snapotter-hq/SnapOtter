---
description: "Вырезание фрагмента из видео путём указания времени начала и конца."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 44884e79dadb
---

# Trim Video {#trim-video}

Вырезание фрагмента из видео путём указания времени начала и конца в секундах, с опцией покадрово точной обрезки.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Время начала в секундах (должно быть >= 0) |
| endS | number | Yes | - | Время конца в секундах (должно быть после startS) |
| precise | boolean | No | `false` | Перекодирование для покадрово точной обрезки вместо поиска по ключевым кадрам |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Когда `precise` равно `false` (по умолчанию), инструмент использует поиск по ключевым кадрам, что быстро, но обрезка может начаться на несколько кадров раньше запрошенного времени.
- Установка `precise` в `true` перекодирует сегмент для точных границ кадров, но занимает больше времени.
- Значение `endS` должно быть больше `startS`.
