---
description: "Мультиплексирование дорожки субтитров в контейнер видео."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 056a7cba8860
---

# Embed Subtitles {#embed-subtitles}

Мультиплексирование файла субтитров в контейнер видео как программной дорожки субтитров, которую зрители могут включать или отключать.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Принимает multipart form data с файлом видео и файлом субтитров, а также полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | Код языка ISO 639-2/B (3 строчные буквы, например `"eng"`, `"fra"`, `"deu"`) |

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

- Загрузите два файла: первым должно быть видео, вторым - файл субтитров (.srt, .vtt или .ass).
- Встроенные (программные) субтитры зритель может включать и выключать в своём медиаплеере. Для постоянно видимых субтитров используйте вместо этого инструмент Burn Subtitles.
- Код языка сохраняется как метаданные в контейнере и помогает медиаплеерам подписывать дорожку субтитров.
