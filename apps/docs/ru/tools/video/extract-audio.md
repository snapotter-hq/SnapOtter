---
description: "Извлечение аудиодорожки из видео."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: b9bece49726e
---

# Extract Audio {#extract-audio}

Извлечение аудиодорожки из файла видео и сохранение её в формате MP3, WAV, M4A или OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Выходной формат аудио: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Если у видео нет аудиодорожки, запрос возвращает ошибку 400.
- MP3 использует сжатие с потерями, но широко совместим. WAV без потерь, но большой. M4A (AAC) обеспечивает хороший баланс качества и размера. OGG доступен для рабочих процессов с открытым кодеком.
- Когда исходное аудио уже в формате AAC, а выходной формат - M4A, аудиопоток копируется без перекодирования.
