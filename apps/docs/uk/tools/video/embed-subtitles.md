---
description: "Додає доріжку субтитрів у відеоконтейнер."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: e2900a849e17
---

# Embed Subtitles {#embed-subtitles}

Додає файл субтитрів у відеоконтейнер як програмну доріжку субтитрів, яку глядачі можуть вмикати чи вимикати.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Приймає дані форми multipart із відеофайлом і файлом субтитрів, а також полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | Код мови за ISO 639-2/B (3 малі літери, наприклад `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- Завантажте два файли: перший має бути відео, другий має бути файлом субтитрів (.srt, .vtt або .ass).
- Вбудовані (програмні) субтитри глядач може перемикати у своєму медіапрогравачі. Для постійно видимих субтитрів використовуйте натомість інструмент Burn Subtitles.
- Код мови зберігається як метадані в контейнері й допомагає медіапрогравачам маркувати доріжку субтитрів.
