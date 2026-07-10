---
description: "Поворот или отражение видео."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: ebfcb5fe45b5
---

# Rotate Video {#rotate-video}

Поворот видео на 90, 180 или 270 градусов либо его отражение по горизонтали или вертикали.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Применяемое преобразование: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Поворот на 90 градусов по часовой стрелке
- **ccw90** - Поворот на 90 градусов против часовой стрелки
- **180** - Поворот на 180 градусов
- **hflip** - Отражение по горизонтали (зеркально)
- **vflip** - Отражение по вертикали

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Повороты на 90 или 270 градусов меняют местами ширину и высоту видео.
- Операции отражения (hflip, vflip) не изменяют размеры видео.
