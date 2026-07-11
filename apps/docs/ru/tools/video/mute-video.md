---
description: "Удаление аудиодорожки из видео."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 620de02e49ae
---

# Mute Video {#mute-video}

Удаление аудиодорожки из видео, при котором остаётся только видеопоток.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Принимает multipart form data с файлом видео. У этого инструмента нет настраиваемых параметров.

## Parameters {#parameters}

У этого инструмента нет параметров. Он удаляет аудиодорожку из загруженного видео.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- Видеопоток копируется без перекодирования, поэтому потери качества нет.
- Если у входного видео нет аудиодорожки, файл возвращается без изменений.
