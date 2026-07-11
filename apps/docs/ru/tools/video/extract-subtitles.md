---
description: "Извлечение дорожки субтитров из видео в виде файла SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 4f7617552b55
---

# Extract Subtitles {#extract-subtitles}

Извлечение встроенной дорожки субтитров из контейнера видео и её загрузка в виде файла SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Принимает multipart form data с файлом видео. У этого инструмента нет настраиваемых параметров.

## Parameters {#parameters}

У этого инструмента нет параметров. Он извлекает первую найденную дорожку субтитров в контейнере видео.

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

- Видео должно содержать встроенную дорожку субтитров. Если дорожка субтитров не найдена, запрос возвращает ошибку 400.
- Если у видео несколько дорожек субтитров, извлекается первая.
- Выходной формат - SRT независимо от исходного формата субтитров в контейнере.
