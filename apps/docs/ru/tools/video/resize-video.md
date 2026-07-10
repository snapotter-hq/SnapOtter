---
description: "Масштабирование видео до нового разрешения или заранее заданного размера."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: ae7f1c66ccc0
---

# Resize Video {#resize-video}

Масштабирование видео до нового разрешения с использованием произвольных размеров в пикселях или стандартного пресета.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Целевая ширина в пикселях (16-7680) |
| height | integer | No | - | Целевая высота в пикселях (16-4320) |
| preset | string | No | `"custom"` | Пресет разрешения: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Когда `preset` равно `"custom"`, необходимо указать хотя бы одно из значений `width` или `height`. Другое измерение масштабируется пропорционально.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Изменение размера до произвольных размеров:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- Значения пресетов соответствуют стандартным высотам (например, `720p` = 1280x720, `1080p` = 1920x1080). Ширина масштабируется пропорционально соотношению сторон исходника.
- Размеры округляются до чётных чисел, как того требует большинство видеокодеков.
- Максимальное поддерживаемое разрешение - 7680x4320 (8K UHD).
