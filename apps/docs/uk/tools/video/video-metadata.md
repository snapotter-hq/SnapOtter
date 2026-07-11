---
description: "Видаляє метадані з відео та повідомляє, що було знайдено."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: c80552678ac9
---

# Clean Video Metadata {#clean-video-metadata}

Видаляє метадані (дата створення, GPS-координати, модель камери, теги програмного забезпечення тощо) з відео та повідомляє, що було видалено.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Приймає дані форми multipart із відеофайлом. Цей інструмент не має налаштувань.

## Parameters {#parameters}

Цей інструмент не має параметрів. Він видаляє всі метадані з відеоконтейнера.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- Видалені метадані включають мітки часу створення, дані GPS/розташування, інформацію про камеру/пристрій і теги програмного забезпечення.
- Відео- та аудіопотоки копіюються без перекодування, тому втрати якості немає.
- Корисно для приватності перед публічним поширенням відео.
