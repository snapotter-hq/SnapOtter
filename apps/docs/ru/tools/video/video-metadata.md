---
description: "Удаление метаданных из видео и отчёт о найденном."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 66bc92e93424
---

# Clean Video Metadata {#clean-video-metadata}

Удаление метаданных (даты создания, координат GPS, модели камеры, тегов программного обеспечения и т. д.) из видео и отчёт о том, что было удалено.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Принимает multipart form data с файлом видео. У этого инструмента нет настраиваемых параметров.

## Parameters {#parameters}

У этого инструмента нет параметров. Он удаляет все метаданные из контейнера видео.

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

- Удаляемые метаданные включают отметки времени создания, данные GPS/местоположения, сведения о камере/устройстве и теги программного обеспечения.
- Видео- и аудиопотоки копируются без перекодирования, поэтому потери качества нет.
- Полезно для конфиденциальности перед публичным распространением видео.
