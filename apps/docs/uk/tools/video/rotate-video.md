---
description: "Обертає або віддзеркалює відео."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 986c5b07052b
---

# Rotate Video {#rotate-video}

Обертає відео на 90, 180 або 270 градусів чи віддзеркалює його горизонтально або вертикально.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Перетворення для застосування: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Обернути на 90 градусів за годинниковою стрілкою
- **ccw90** - Обернути на 90 градусів проти годинникової стрілки
- **180** - Обернути на 180 градусів
- **hflip** - Віддзеркалити горизонтально (дзеркало)
- **vflip** - Віддзеркалити вертикально

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

- Обертання на 90 або 270 градусів міняє місцями ширину й висоту відео.
- Операції віддзеркалення (hflip, vflip) не змінюють розміри відео.
