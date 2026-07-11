---
description: "Воспроизведение видеоклипа задом наперёд."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 3979c9700874
---

# Reverse Video {#reverse-video}

Воспроизведение видеоклипа задом наперёд. Аудиодорожка также воспроизводится в обратном порядке.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Принимает multipart form data с файлом видео. У этого инструмента нет настраиваемых параметров.

## Parameters {#parameters}

У этого инструмента нет параметров. Он разворачивает всё видео.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- Ограничено клипами длительностью до 5 минут. Более длинные видео отклоняются с ошибкой 400.
- Разворачиваются и видео-, и аудиодорожка. Чтобы развернуть видео без звука, сначала отключите звук.
