---
description: "Ускорение или замедление видео."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: cf86fea532ee
---

# Video Speed {#video-speed}

Ускорение или замедление видео с опцией сохранения высоты тона аудио.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Множитель скорости (0.25-4). Значения выше 1 ускоряют, ниже 1 замедляют |
| keepPitch | boolean | No | `true` | Сохранять высоту тона аудио при изменении скорости |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Множитель `2` удваивает скорость воспроизведения (уменьшает длительность вдвое). Множитель `0.5` уменьшает скорость воспроизведения вдвое (удваивает длительность).
- Когда `keepPitch` равно `true`, аудио растягивается во времени, чтобы голоса звучали естественно. Когда `false`, высота тона смещается пропорционально скорости.
- Допустимый диапазон - от 0.25x до 4x.
