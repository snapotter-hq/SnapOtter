---
description: "Нормализация громкости аудио видео до вещательного стандарта."
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: 791c95bb5835
---

# Normalize Audio {#normalize-audio}

Нормализация громкости аудио видео до вещательного стандарта громкости EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Принимает multipart form data с файлом видео. У этого инструмента нет настраиваемых параметров.

## Parameters {#parameters}

У этого инструмента нет параметров. Он применяет нормализацию громкости EBU R128 к аудиодорожке.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Использует фильтр `loudnorm` из FFmpeg с целевой интегральной громкостью -16 LUFS, истинным пиком -1.5 dBTP и диапазоном громкости 11 LU (вещательный стандарт EBU R128).
- Частота дискретизации исходного аудио сохраняется в выходном файле.
- Если у видео нет аудиодорожки, запрос возвращает ошибку 400.
